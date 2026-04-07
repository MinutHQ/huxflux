// Canonical derivation of "is this agent currently streaming".
//
// Two-factor: the server's streaming flag (projection of the in-memory
// runningProcesses Map + startup reset + API override) AND, when messages are
// available, the last assistant message not yet having a durationMs. Either
// factor falsy → not streaming. This eliminates the drift between "server
// thinks it's running" and "the message is already finalized on disk".

interface MinimalMessage {
  role: string
  durationMs?: number | null
}

interface AgentStateInput {
  streaming?: boolean | number | null
  messages?: MinimalMessage[]
}

export function isAgentStreaming(agent: AgentStateInput): boolean {
  if (!agent.streaming) return false
  const msgs = agent.messages
  if (msgs && msgs.length > 0) {
    const last = msgs[msgs.length - 1]
    if (last.role === "assistant" && last.durationMs != null) return false
  }
  return true
}
