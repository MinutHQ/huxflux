import type { Message } from "@huxflux/shared"

/**
 * Returns true when an ExitPlanMode tool call exists with no user response after it
 * indicating plan approval.
 */
export function hasExitPlanModeUnapproved(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    // If user already responded after an ExitPlanMode, the plan was handled
    if (msg.role === "user" && /plan approved|approved/i.test(msg.content)) return false
    if (msg.role === "assistant" && msg.toolCalls?.some((tc) => tc.tool === "ExitPlanMode")) return true
  }
  return false
}

/** Returns true when Claude entered plan mode (in any recent message) and hasn't exited yet */
export function claudeInPlanMode(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const tcs = messages[i].toolCalls ?? []
    if (tcs.some((tc) => tc.tool === "ExitPlanMode")) return false
    if (tcs.some((tc) => tc.tool === "EnterPlanMode")) return true
  }
  return false
}

/**
 * Extract the plan to show for approval.
 *
 * The agent writes its plan to a file (e.g. `~/.claude/plans/<slug>.md`) and
 * calls ExitPlanMode once with a snapshot of it. Subsequent revisions only
 * *edit that file* — they do not re-call ExitPlanMode. So the ExitPlanMode arg
 * goes stale. To show the current plan we identify the plan file and replay its
 * Write/Edit tool calls (all present in the message stream), falling back to the
 * ExitPlanMode snapshot when the file can't be identified or reconstructed.
 */
export function extractPlanContent(messages: Message[]): string | null {
  let latest: string | null = null
  for (let i = messages.length - 1; i >= 0 && latest === null; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    const tcs = msg.toolCalls ?? []
    for (let j = tcs.length - 1; j >= 0; j--) {
      if (tcs[j].tool !== "ExitPlanMode") continue
      const plan = parseArgs(tcs[j].args)?.plan
      if (typeof plan === "string") { latest = plan; break }
    }
  }
  if (latest === null) return null

  // Reconstruct only against the latest plan's file. Matching every historical
  // snapshot would mis-identify an older plan file when the agent re-plans.
  const planPath = findPlanFilePath(messages, latest.trim())
  if (planPath) {
    const reconstructed = reconstructFile(messages, planPath)
    if (reconstructed && reconstructed.trim()) return reconstructed
  }
  return latest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseArgs(args: string | undefined): Record<string, unknown> | null {
  if (!args) return null
  try {
    const parsed: unknown = JSON.parse(args)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Find the plan file's path. Primary signal: a Write whose content matches the
 * latest ExitPlanMode snapshot (they're identical at creation). Fallback: the
 * most recent Write to a path under a `plans/` directory.
 */
function findPlanFilePath(messages: Message[], snapshot: string): string | null {
  let plansDirPath: string | null = null
  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    for (const tc of msg.toolCalls ?? []) {
      if (tc.tool !== "Write") continue
      const args = parseArgs(tc.args)
      const filePath = args?.file_path
      const content = args?.content
      if (typeof filePath !== "string") continue
      if (typeof content === "string" && content.trim() === snapshot) return filePath
      if (/[/\\]plans[/\\]/.test(filePath)) plansDirPath = filePath
    }
  }
  return plansDirPath
}

/**
 * Replay every Write/Edit/MultiEdit targeting `filePath`, in order, to rebuild it.
 * Assumes the initial Write is within the loaded message window; if it has been
 * paginated out, `content` stays null and the caller falls back to the snapshot.
 */
function reconstructFile(messages: Message[], filePath: string): string | null {
  let content: string | null = null
  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    for (const tc of msg.toolCalls ?? []) {
      const args = parseArgs(tc.args)
      if (!args || args.file_path !== filePath) continue
      if (tc.tool === "Write" && typeof args.content === "string") {
        content = args.content
      } else if (tc.tool === "Edit" && content !== null) {
        content = applyEdit(content, args)
      } else if (tc.tool === "MultiEdit" && content !== null && Array.isArray(args.edits)) {
        for (const edit of args.edits) {
          if (isRecord(edit)) content = applyEdit(content, edit)
        }
      }
    }
  }
  return content
}

/** Apply one Edit (first-occurrence, or all when replace_all). Misses are skipped. */
function applyEdit(content: string, edit: Record<string, unknown>): string {
  const oldStr = edit.old_string
  const newStr = edit.new_string
  if (typeof oldStr !== "string" || typeof newStr !== "string") return content
  if (edit.replace_all) return content.split(oldStr).join(newStr)
  const idx = content.indexOf(oldStr)
  if (idx === -1) return content
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length)
}
