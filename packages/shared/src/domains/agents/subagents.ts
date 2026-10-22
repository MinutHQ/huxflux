import type { ToolCall } from "./agents.types.js"

// Names the CLI has used for the tool that spawns a sub-agent. "Task" is the
// older name; current CLIs call it "Agent".
const agentToolNames = new Set(["Agent", "Task"])

/** True when `tool` is the tool call that spawns a sub-agent. */
export function isAgentTool(tool: string | undefined): boolean {
  return tool !== undefined && agentToolNames.has(tool)
}

/** A tool call is in flight only while its message is still streaming AND
 *  no result has landed. Without the streaming guard, a call that never got a
 *  result (legacy rows) would look live forever. A sub-agent with a reported
 *  status follows that status instead: a background sub-agent's tool result
 *  arrives the moment it is launched, long before it finishes. */
export function isToolCallRunning(call: ToolCall, isStreaming: boolean | undefined): boolean {
  if (call.subagentStatus) return call.subagentStatus === "running"
  return !!isStreaming && !call.result
}

/** What a sub-agent handed back, for display. A background sub-agent's tool
 *  result is only the CLI's launch receipt, so the summary from its finish
 *  notification wins, and nothing shows while it still runs. Returns
 *  undefined when the text already ends the sub-agent's streamed output. */
export function subagentResultText(call: ToolCall): string | undefined {
  const text = call.subagentSummary ?? (call.subagentStatus === "running" ? undefined : call.result)
  if (!text?.trim()) return undefined
  if (call.outputText?.trimEnd().endsWith(text.trim())) return undefined
  return text
}
