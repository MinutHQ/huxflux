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

/** Extract plan content from the most recent ExitPlanMode tool call args. */
export function extractPlanContent(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    const exitTc = msg.toolCalls?.find((tc) => tc.tool === "ExitPlanMode")
    if (exitTc?.args) {
      try {
        const parsed = JSON.parse(exitTc.args)
        if (parsed.plan) return parsed.plan as string
      } catch { /* ignore */ }
    }
  }
  return null
}
