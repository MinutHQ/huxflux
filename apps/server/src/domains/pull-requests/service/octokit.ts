import { Octokit } from "@octokit/rest"
import { throttling } from "@octokit/plugin-throttling"
import { retry } from "@octokit/plugin-retry"
import { config } from "../../../config.js"
import { createEtagFetch } from "./etagCache.js"
import { markRateLimited } from "./rateLimitState.js"

// One shared, throttled, auto-retrying client for the whole process. The poller
// fans out dozens of GitHub calls per cycle; a single instance lets undici reuse
// connections, the throttling plugin paces against primary/secondary rate limits,
// and the retry plugin transparently re-attempts transient failures (the connect
// timeouts that otherwise surface as "[poller] Connect Timeout Error"). Every GET
// replays its last ETag (see etagCache.ts) so unchanged resources cost no quota.
// The client is rebuilt when the configured token changes (e.g. a settings update).
//
// On a primary rate limit we do NOT wait for the reset: the throttling plugin
// would park the request for up to an hour while the poller keeps queueing new
// cycles behind it, which then all fire at once on reset. Instead we trip the
// shared back-off and fail the request, so the poller skips cycles until reset.
const ThrottledOctokit = Octokit.plugin(throttling, retry)

let shared: Octokit | undefined
let sharedToken: string | undefined
let cachedUserPromise: Promise<{ id: number; login: string }> | undefined

/** The shared Octokit instance, configured with the GitHub token, throttling and retry. */
export function getOctokit(): Octokit {
  const token = config.githubToken || undefined
  if (shared && sharedToken === token) return shared
  sharedToken = token
  cachedUserPromise = undefined
  shared = new ThrottledOctokit({
    auth: token,
    request: { fetch: createEtagFetch() },
    throttle: {
      onRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`[octokit] rate limit for ${options.method} ${options.url}; pausing GitHub polling for ${retryAfter}s`)
        markRateLimited(retryAfter)
        return false
      },
      // Secondary limits come from short bursts and clear in about a minute, so
      // one paced retry is worth it; we still pause the poller so it does not
      // keep feeding the burst while that retry waits.
      onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`[octokit] secondary rate limit for ${options.method} ${options.url}; retry #${retryCount} in ${retryAfter}s`)
        markRateLimited(retryAfter)
        return retryCount < 1
      },
    },
  })
  return shared
}

/** Cached version of octokit.users.getAuthenticated(). Result is cleared when the token changes. */
export async function getAuthenticatedUser(): Promise<{ id: number; login: string }> {
  if (cachedUserPromise) return cachedUserPromise
  const octokit = getOctokit()
  cachedUserPromise = octokit.users.getAuthenticated()
    .then(({ data }) => ({ id: data.id, login: data.login }))
    .catch((err) => { cachedUserPromise = undefined; throw err })
  return cachedUserPromise
}

/** Parse owner/repo from a remote URL (HTTPS, SSH with host alias, or owner/repo shorthand). */
export function parseRepo(repoUrl: string): { owner: string; repo: string } {
  // git@<any-host>:<owner>/<repo>.git  (SSH, including host aliases)
  const ssh = repoUrl.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (ssh) return { owner: ssh[1], repo: ssh[2] }

  // https://github.com/owner/repo or github.com/owner/repo
  const https = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (https) return { owner: https[1], repo: https[2] }

  // owner/repo shorthand
  const short = repoUrl.match(/^([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (short) return { owner: short[1], repo: short[2] }

  throw new Error(`Cannot parse repo URL: ${repoUrl}`)
}
