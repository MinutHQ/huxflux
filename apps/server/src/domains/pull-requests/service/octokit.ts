import { Octokit } from "@octokit/rest"
import { config } from "../../../config.js"

/** Build a fresh Octokit instance using the configured GitHub token. */
export function getOctokit(): Octokit {
  return new Octokit({ auth: config.githubToken || undefined })
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
