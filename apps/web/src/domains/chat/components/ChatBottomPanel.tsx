import { cn } from "@huxflux/ui"
import { IconChevronDown } from "@tabler/icons-react"
import type { Agent } from "@huxflux/shared"
import { getFlag } from "@/lib/flags"
import { ThreadAgentsBar } from "./ThreadAgentsBar"
import { TeamAgentBar } from "./TeamAgentBar"
import { TasksBar } from "./TasksBar"
import { BackgroundTasksStrip } from "./BackgroundTasksStrip"
import { AskUserQuestionCard } from "./AskUserQuestionCard"
import { ToolApprovalCard } from "./ToolApprovalCard"
import { ChatInputBar } from "./ChatInputBar"
import { extractTeamAgents } from "../extract/teamAgents"
import type { PendingQuestion } from "../chat.types"
import type { ChatInputBarProps } from "./chatInputBarTypes"

interface ChatBottomPanelProps {
  agent: Agent
  uiIsStreaming: boolean
  isAtBottom: boolean
  onScrollToBottom: () => void
  pendingQuestion: PendingQuestion | null
  onAnswerQuestion: (answers: Record<string, string>) => Promise<void> | void
  onDismissQuestion: () => void
  onApproveTool: (toolUseId: string, decision: "allow" | "deny") => Promise<void> | void
  inputBarProps: ChatInputBarProps
}

export function ChatBottomPanel({ agent, uiIsStreaming, isAtBottom, onScrollToBottom, pendingQuestion, onAnswerQuestion, onDismissQuestion, onApproveTool, inputBarProps }: ChatBottomPanelProps) {
  // Narrowed once so the callback below closes over a non-null value rather
  // than re-reading a field TypeScript cannot prove is still set.
  const pendingApproval = agent.pendingApproval ?? null

  return (
    <div className="shrink-0 relative">
      {!isAtBottom && agent.messages.length > 0 && (
        <button
          onClick={onScrollToBottom}
          className={cn(
            "absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-lg text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
          )}
        >
          <IconChevronDown size={13} />
          <span>Scroll to bottom</span>
        </button>
      )}
      <div className="px-5 py-4">
        {getFlag("threads") && <ThreadAgentsBar agentId={agent.id} />}
        <TeamAgentBar agents={extractTeamAgents(agent.messages, uiIsStreaming)} isStreaming={uiIsStreaming} agentId={agent.id} />
        <TasksBar agentId={agent.id} isStreaming={uiIsStreaming} />
        <BackgroundTasksStrip agentId={agent.id} />
        {pendingApproval && (
          <ToolApprovalCard
            key={pendingApproval.toolUseId}
            toolName={pendingApproval.toolName}
            input={pendingApproval.input}
            onDecide={(decision) => onApproveTool(pendingApproval.toolUseId, decision)}
          />
        )}
        {pendingQuestion && pendingQuestion.agentId === agent.id && Array.isArray(pendingQuestion.questions) && pendingQuestion.questions.length > 0 && (
          <AskUserQuestionCard
            key={pendingQuestion.toolUseId}
            questions={pendingQuestion.questions}
            onSubmit={onAnswerQuestion}
            onDismiss={onDismissQuestion}
          />
        )}
        <ChatInputBar {...inputBarProps} />
      </div>
    </div>
  )
}
