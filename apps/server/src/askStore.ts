// Tracks pending AskUserQuestion tool_use_ids per agent.
// Set by the streaming parser in runner.ts when it detects AskUserQuestion.
// Read by the /answer endpoint in agents.ts to write the answer file.

const pending = new Map<string, string>() // agentId → toolUseId

export function setPendingQuestion(agentId: string, toolUseId: string): void {
  pending.set(agentId, toolUseId)
}

export function getPendingToolUseId(agentId: string): string | undefined {
  return pending.get(agentId)
}

export function clearPendingQuestion(agentId: string): void {
  pending.delete(agentId)
}
