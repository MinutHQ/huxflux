import { Octokit } from "@octokit/rest"
import { config } from "../../../config.js"

let cachedOctokit: Octokit | null = null
let cachedToken: string | undefined

export function getOctokit(): Octokit {
  const token = config.githubToken || undefined
  if (cachedOctokit && cachedToken === token) return cachedOctokit
  cachedToken = token
  cachedOctokit = new Octokit({
    auth: token,
    request: { timeout: 15_000 },
  })
  return cachedOctokit
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
