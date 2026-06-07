// Canonical derivation of "is this agent currently streaming".
//
// Single-factor: the DB streaming flag (set to 1 when the CLI spawns,
// cleared to 0 when it exits or crashes). The server is the source of
// truth for this flag. Previously we also checked durationMs on the last
// assistant message, but that caused false negatives when the message
// cache was stale (e.g. new turn started, old assistant message still
// last in the array with durationMs set).

interface AgentStateInput {
  streaming?: boolean | number | null
}

export function isAgentStreaming(agent: AgentStateInput): boolean {
  return !!agent.streaming
}
