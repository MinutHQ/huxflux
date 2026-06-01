// Tracks pending AskUserQuestion state per agent.
// Set by the streaming parser in runner.ts when it detects AskUserQuestion.
// Read by the /answer endpoint to write the answer file with the full tool input.

interface PendingQuestion {
  toolUseId: string
  questions: Array<{ question: string; header?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }>
}

const pending = new Map<string, PendingQuestion>()

export function setPendingQuestion(agentId: string, toolUseId: string, questions: PendingQuestion["questions"]): void {
  pending.set(agentId, { toolUseId, questions })
}

export function getPendingQuestion(agentId: string): PendingQuestion | undefined {
  return pending.get(agentId)
}

export function clearPendingQuestion(agentId: string): void {
  pending.delete(agentId)
}
