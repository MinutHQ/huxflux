// Tracks tool calls an agent is blocked on, waiting for the user to allow or
// deny them. The peer of askStore: a question asks the user to choose between
// options the agent offered, an approval asks whether a tool may run at all.
//
// Set by the control-protocol handler when the provider sends a `can_use_tool`
// control_request for anything other than AskUserQuestion. Read by the
// /approve endpoint to build the control_response written back to the agent.
//
// Only one approval is pending per agent at a time: the agent is blocked on
// the response, so it cannot ask about a second tool until the first settles.

export interface PendingApprovalEntry {
  /** control_request id — echoed back in the control_response */
  requestId: string
  toolUseId: string
  toolName: string
  input: unknown
}

const pending = new Map<string, PendingApprovalEntry>()

export function setPendingApproval(agentId: string, entry: PendingApprovalEntry): void {
  pending.set(agentId, entry)
}

export function getPendingApproval(agentId: string): PendingApprovalEntry | undefined {
  return pending.get(agentId)
}

export function clearPendingApproval(agentId: string): void {
  pending.delete(agentId)
}

/** Wire shape served on the agent detail (no control-request id). */
export function getPendingApprovalPayload(agentId: string): { toolUseId: string; toolName: string; input: unknown } | null {
  const entry = pending.get(agentId)
  return entry ? { toolUseId: entry.toolUseId, toolName: entry.toolName, input: entry.input } : null
}
