// Tracks pending AskUserQuestion state per agent.
// Set by the control-protocol handler in agent-runner when the Claude CLI
// sends a `can_use_tool` control_request for AskUserQuestion. Read by the
// /answer endpoint to build the control_response written back to the CLI.

export interface PendingQuestionEntry {
  question: string
  header?: string
  multiSelect?: boolean
  options?: Array<{ label: string; description?: string }>
}

interface PendingQuestion {
  /** control_request id — echoed back in the control_response */
  requestId: string
  toolUseId: string
  questions: PendingQuestionEntry[]
}

const pending = new Map<string, PendingQuestion>()

export function setPendingQuestion(
  agentId: string,
  requestId: string,
  toolUseId: string,
  questions: PendingQuestion["questions"],
): void {
  pending.set(agentId, { requestId, toolUseId, questions })
}

export function getPendingQuestion(agentId: string): PendingQuestion | undefined {
  return pending.get(agentId)
}

export function clearPendingQuestion(agentId: string): void {
  pending.delete(agentId)
}
