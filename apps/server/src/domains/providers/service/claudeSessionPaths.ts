import * as os from "node:os"
import * as path from "node:path"

/**
 * On-disk locations of the Claude CLI's own session state. Shared by the
 * `claude` adapter, which drives the Claude CLI binary. Other providers keep
 * their session state
 * elsewhere and must not be probed against these paths.
 */

/** Claude writes one JSONL transcript per session, keyed by a slug of the cwd. */
export function claudeSessionFilePath(cwd: string, sessionId: string): string {
  return path.join(os.homedir(), ".claude", "projects", cwd.replace(/[./]/g, "-"), `${sessionId}.jsonl`)
}

/** Presence of a project-local settings file means Claude has run in this cwd. */
export function claudeContinueProbePath(cwd: string): string {
  return path.join(cwd, ".claude", "settings.json")
}
