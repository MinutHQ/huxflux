import { useCallback, useState } from "react"
import type { AgentsServerEvent } from "../agents.types.js"

type AskQuestionEvent = Extract<AgentsServerEvent, { type: "ask:question" }>

export interface PendingQuestion {
  agentId: string
  toolUseId: string
  questions: AskQuestionEvent["questions"]
}

/**
 * Tracks the most recent `ask:question` frame so the UI can surface an
 * AskUserQuestion prompt. Cleared via the returned `clearPendingQuestion`
 * callback once the user answers.
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

  const clearPendingQuestion = useCallback(() => setPendingQuestion(null), [])

  return { pendingQuestion, clearPendingQuestion, handleEvent }
}
