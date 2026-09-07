import { useCallback, useState } from "react"
import type { AgentsServerEvent } from "../agents.types.js"

type AskQuestionEvent = Extract<AgentsServerEvent, { type: "ask:question" }>
type AskResolvedEvent = Extract<AgentsServerEvent, { type: "ask:resolved" }>

export interface PendingQuestion {
  agentId: string
  toolUseId: string
  questions: AskQuestionEvent["questions"]
}

/**
 * Tracks the most recent `ask:question` frame so the UI can surface an
 * AskUserQuestion prompt. Cleared via the returned `clearPendingQuestion`
 * callback once the user answers, or by an `ask:resolved` frame when the
 * question was answered elsewhere (another client, a chat reply) or cancelled.
 */
export function useAgentPendingQuestion() {
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)

  const handleEvent = useCallback((event: AskQuestionEvent) => {
    setPendingQuestion({
      agentId: event.agentId,
      toolUseId: event.toolUseId,
      questions: event.questions,
    })
  }, [])

  const handleResolved = useCallback((event: AskResolvedEvent) => {
    setPendingQuestion((prev) =>
      prev && prev.agentId === event.agentId && prev.toolUseId === event.toolUseId ? null : prev,
    )
  }, [])

  const clearPendingQuestion = useCallback(() => setPendingQuestion(null), [])

  return { pendingQuestion, clearPendingQuestion, handleEvent, handleResolved }
}
