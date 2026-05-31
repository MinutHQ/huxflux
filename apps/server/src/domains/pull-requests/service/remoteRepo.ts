import * as os from "node:os"
import { db } from "../../../db/index.js"
import { repos } from "../../../db/schema.js"
import { getRemoteUrl } from "../../git/worktrees.js"

/**
 * Extract "owner/repo" from a git remote URL, lowercased for comparison.
 * Handles github.com HTTPS, github.com SSH, and custom SSH host aliases
 * (e.g. gh_work:owner/repo).
 */
export function remoteToRepoId(url: string): string | null {
  const cleaned = url.trim().replace(/\/$/, "")
  // HTTPS: https://github.com/owner/repo[.git]
  const https = cleaned.match(/^https?:\/\/[^/]+\/([^/]+\/[^/?#]+?)(?:\.git)?$/)
  if (https) return https[1].toLowerCase()
  // SSH: git@<any-host>:owner/repo[.git]
  const ssh = cleaned.match(/^git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/)
  if (ssh) return ssh[1].toLowerCase()
  return null
}

/**
 * Find a locally configured repo whose remote URL maps to the given
 * `owner/repo`. Returns the matched repo path (for cwd) and a debug log
 * of all candidates inspected so unmatched runs can be diagnosed.
 */
export async function resolveLocalRepoCwd(repoSlug: string): Promise<{ cwd: string; matched: boolean; debugRows: string[] }> {
  const allRepos = db.select().from(repos).all()
  const debugRows: string[] = []
  for (const r of allRepos) {
    const remoteUrl = await getRemoteUrl(r.path, r.remote)
    const parsed = remoteUrl ? remoteToRepoId(remoteUrl) : null
    debugRows.push(`  ${r.name}: remote="${remoteUrl}" → parsed="${parsed}"`)
    if (parsed && parsed === repoSlug.toLowerCase()) {
      return { cwd: r.path, matched: true, debugRows }
    }
  }
  return { cwd: os.homedir(), matched: false, debugRows }
}
