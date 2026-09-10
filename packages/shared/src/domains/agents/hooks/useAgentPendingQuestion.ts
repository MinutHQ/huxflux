import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent, AgentPendingQuestion, AgentsServerEvent } from "../agents.types.js"

type AskQuestionEvent = Extract<AgentsServerEvent, { type: "ask:question" }>
type AskResolvedEvent = Extract<AgentsServerEvent, { type: "ask:resolved" }>

export interface PendingQuestion {
  agentId: string
  toolUseId: string
  questions: AskQuestionEvent["questions"]
}

/**
 * The AskUserQuestion the agent is currently blocked on.
 *
 * The question is stored on the agent detail cache entry (`pendingQuestion`),
 * not in component state: the agent route remounts on every agent switch, and
 * `ask:question` is only delivered to sockets subscribed at that moment, so
 * local state lost the card whenever the user was on another agent, reloaded,
 * or reconnected. The server serves the same field on GET /api/agents/:id, so
 * every refetch re-hydrates it. Cleared via `clearPendingQuestion` once the
 * user answers, or by an `ask:resolved` frame when the question was answered
 * elsewhere (another client, a chat reply) or cancelled.
 */
export function useAgentPendingQuestion(id: string | null, current: AgentPendingQuestion | null | undefined) {
  const queryClient = useQueryClient()

  const write = useCallback(
    (updater: (prev: AgentPendingQuestion | null) => AgentPendingQuestion | null) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(id), (old) => {
        if (!old) return old
        const next = updater(old.pendingQuestion ?? null)
        if (next === (old.pendingQuestion ?? null)) return old
        return { ...old, pendingQuestion: next }
      })
    },
    [id, queryClient],
  )

  const handleEvent = useCallback((event: AskQuestionEvent) => {
    write(() => ({ toolUseId: event.toolUseId, questions: event.questions }))
  }, [write])

  const handleResolved = useCallback((event: AskResolvedEvent) => {
    write((prev) => (prev && prev.toolUseId === event.toolUseId ? null : prev))
  }, [write])

  const clearPendingQuestion = useCallback(() => write(() => null), [write])

  const pendingQuestion = useMemo<PendingQuestion | null>(() => {
    if (!id || !current || !Array.isArray(current.questions) || current.questions.length === 0) return null
    return { agentId: id, toolUseId: current.toolUseId, questions: current.questions }
  }, [id, current])

  return { pendingQuestion, clearPendingQuestion, handleEvent, handleResolved }
}
