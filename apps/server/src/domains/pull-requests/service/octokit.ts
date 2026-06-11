import { Octokit } from "@octokit/rest"
import { throttling } from "@octokit/plugin-throttling"
import { retry } from "@octokit/plugin-retry"
import { config } from "../../../config.js"

// One shared, throttled, auto-retrying client for the whole process. The poller
// fans out dozens of GitHub calls per cycle; a single instance lets undici reuse
// connections, the throttling plugin paces against primary/secondary rate limits,
// and the retry plugin transparently re-attempts transient failures (the connect
// timeouts that otherwise surface as "[poller] Connect Timeout Error").
const ThrottledOctokit = Octokit.plugin(throttling, retry)

let shared: Octokit | undefined

/** The shared Octokit instance, configured with the GitHub token, throttling and retry. */
export function getOctokit(): Octokit {
  if (shared) return shared
  shared = new ThrottledOctokit({
    auth: config.githubToken || undefined,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`[octokit] rate limit for ${options.method} ${options.url}; retry #${retryCount} in ${retryAfter}s`)
        return retryCount < 3
      },
      onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`[octokit] secondary rate limit for ${options.method} ${options.url}; retry #${retryCount} in ${retryAfter}s`)
        return retryCount < 3
      },
    },
  })
  return shared
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
