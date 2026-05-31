// Canonical derivation of "is this agent currently streaming".
//
// Two-factor: the DB streaming flag (set to 1 when the CLI spawns, cleared
// to 0 when it exits) AND, when messages are available, the last assistant
// message not yet having a durationMs. Either factor falsy → not streaming.
// The durationMs check prevents showing a loading indicator when the agent
// is between turns (e.g. processing tool results before the next response).

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
    if (last && last.role === "assistant" && last.durationMs != null) return false
  }
  return true
}
