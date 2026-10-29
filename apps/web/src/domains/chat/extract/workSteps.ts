import { isAgentTool, type Message, type ToolCall } from "@huxflux/shared"
import { formatToolCall } from "../utils"
import type { WorkStepKind, WorkStepLabel } from "../chat.types"

const verbs: Record<string, [WorkStepKind, string]> = {
  Bash: ["run", "Running"],
  Read: ["read", "Reading"],
  Write: ["write", "Writing"],
  Edit: ["edit", "Editing"],
  MultiEdit: ["edit", "Editing"],
  Grep: ["search", "Searching"],
  Glob: ["search", "Searching"],
  WebSearch: ["search", "Searching"],
  WebFetch: ["fetch", "Fetching"],
  TaskCreate: ["task", "Planning"],
  TaskUpdate: ["task", "Planning"],
}

/**
 * Top-level tool calls of the running turn: everything after the last user
 * message that was not injected mid-turn. A turn can span several assistant
 * messages (segments), so the calls are gathered across all of them.
 */
export function currentTurnCalls(messages: Message[]): ToolCall[] {
  let start = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg && msg.role === "user" && !msg.injected) {
      start = i + 1
      break
    }
  }
  return messages.slice(start).flatMap((m) => (m.role === "assistant" ? m.toolCalls ?? [] : []))
}

export function describeWorkStep(call: ToolCall): WorkStepLabel {
  const { title, detail, hasDescription } = formatToolCall(call.tool, call.args)
  if (isAgentTool(call.tool)) return { kind: "delegate", verb: "Delegating", text: title, code: false }
  const [kind, verb] = verbs[call.tool] ?? ["other", undefined]
  if (hasDescription) return { kind, verb, text: title, code: false }
  if (call.tool === "Bash") return { kind, verb, text: [title, detail].filter(Boolean).join(" "), code: true }
  if (kind === "other") return { kind, verb, text: detail ? `${title} ${detail}` : title, code: false }
  return { kind, verb, text: detail || title, code: kind === "search" && call.tool !== "WebSearch" }
}

/** "12s" under a minute, "3m 05s" after. */
export function formatWorkClock(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`
}
