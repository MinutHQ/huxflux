import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent, AgentPendingApproval, AgentsServerEvent } from "../agents.types.js"

type AskApprovalEvent = Extract<AgentsServerEvent, { type: "ask:approval" }>
type ApprovalResolvedEvent = Extract<AgentsServerEvent, { type: "approval:resolved" }>

export interface PendingApprovalState {
  agentId: string
  toolUseId: string
  toolName: string
  input: unknown
}

/**
 * The tool call the agent is currently blocked on, waiting to be allowed or
 * denied.
 *
 * Stored on the agent detail cache entry for the same reason as the pending
 * question (see `useAgentPendingQuestion`): the route remounts on every agent
 * switch and `ask:approval` only reaches sockets subscribed at that moment, so
 * component state would lose the card on reload, reconnect, or while the user
 * was looking at another agent. The server serves the same field on
 * GET /api/agents/:id, so every refetch re-hydrates it.
 *
 * There is deliberately no "clear" that is not a decision: the agent's turn is
 * blocked on the control response, so dismissing the card locally would strand
 * it. It clears when `approval:resolved` arrives, which the server sends once
 * a decision has actually been written back.
 */
export function useAgentPendingApproval(id: string | null, current: AgentPendingApproval | null | undefined) {
  const queryClient = useQueryClient()

  const write = useCallback(
    (updater: (prev: AgentPendingApproval | null) => AgentPendingApproval | null) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(id), (old) => {
        if (!old) return old
        const next = updater(old.pendingApproval ?? null)
        if (next === (old.pendingApproval ?? null)) return old
        return { ...old, pendingApproval: next }
      })
    },
    [id, queryClient],
  )

  const handleEvent = useCallback((event: AskApprovalEvent) => {
    write(() => ({ toolUseId: event.toolUseId, toolName: event.toolName, input: event.input }))
  }, [write])

  const handleResolved = useCallback((event: ApprovalResolvedEvent) => {
    write((prev) => (prev && prev.toolUseId === event.toolUseId ? null : prev))
  }, [write])

  const pendingApproval = useMemo<PendingApprovalState | null>(() => {
    if (!id || !current) return null
    return { agentId: id, toolUseId: current.toolUseId, toolName: current.toolName, input: current.input }
  }, [id, current])

  return { pendingApproval, handleEvent, handleResolved }
}
