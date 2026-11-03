import type { AgentPendingApproval } from "@huxflux/shared"
import { AskQuestionCard } from "./AskQuestionCard"
import { ToolApprovalCard } from "./ToolApprovalCard"
import type { ComponentProps } from "react"

type PendingQuestion = ComponentProps<typeof AskQuestionCard>["pendingQuestion"] & { agentId: string }

/**
 * Whatever the agent's turn is currently blocked on. Only one can be pending
 * at a time (the turn waits on a single control response), but both are
 * rendered so neither is missed if that ever changes.
 */
export function AgentBlockedCards({ pendingApproval, pendingQuestion, onQuestionAnswered }: {
  pendingApproval: (AgentPendingApproval & { agentId: string }) | null
  pendingQuestion: PendingQuestion | null
  onQuestionAnswered: () => void
}) {
  return (
    <>
      {pendingApproval && (
        <ToolApprovalCard
          key={pendingApproval.toolUseId}
          agentId={pendingApproval.agentId}
          pendingApproval={pendingApproval}
        />
      )}
      {pendingQuestion && (
        <AskQuestionCard
          key={pendingQuestion.toolUseId}
          agentId={pendingQuestion.agentId}
          pendingQuestion={pendingQuestion}
          onAnswered={onQuestionAnswered}
        />
      )}
    </>
  )
}
