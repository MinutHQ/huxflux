import * as path from "node:path"
import * as os from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { ensureReserve, drainReserves } from "../git/pool.js"
import { logger } from "../../logger.js"

const execFileAsync = promisify(execFile)

export { execFileAsync }

/**
 * Resolves a `~/`-prefixed path to the user's home directory. Other paths are
 * returned unchanged. Used by the clone and quick-start endpoints when the
 * caller hands in a tilde-prefixed location.
 */
export function resolvePath(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p
}

/**
 * Detects the default branch for a repo on disk. Tries, in order, the remote
 * HEAD symbolic ref, known remote branch names (origin/main, origin/master),
 * and finally the local HEAD branch. Falls back to "main" if every step fails.
 */
export async function detectBranchFrom(repoPath: string): Promise<string> {
  // 1. Remote HEAD (e.g. origin/main)
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { timeout: 5000 })
    if (stdout.trim()) return stdout.trim()
  } catch { /* no remote HEAD */ }

  // 2. Known remote branch names
  for (const b of ["origin/main", "origin/master"]) {
    try {
      await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", b], { timeout: 5000 })
      return b
    } catch { /* try next */ }
  }

  // 3. Local HEAD branch (local-only repo)
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "symbolic-ref", "--short", "HEAD"], { timeout: 5000 })
    const localBranch = stdout.trim()
    if (localBranch) return localBranch
  } catch { /* detached HEAD or bare repo */ }

  return "main"
}

/**
 * Keeps the hidden reserve worktree in sync with a setup-script change. The
 * existing reserve is stale either way (it was built with — or without — the
 * old script), so drain and rebuild. Reserves now exist for repos without a
 * setup script too, so removing the script no longer means dropping the
 * reserve entirely.
 *
 * Fire-and-forget — the PATCH handler returns immediately, the reserve
 * refresh runs in the background. Errors are logged and swallowed since the
 * update itself has already succeeded.
 */
export function maintainReserveOnSetupScriptChange(repoId: string, _newScript: string | null | undefined): void {
  drainReserves(repoId)
    .then(() => ensureReserve(repoId))
    .catch((err) => logger.error({ err }, `[reserve] refresh failed`))
}
