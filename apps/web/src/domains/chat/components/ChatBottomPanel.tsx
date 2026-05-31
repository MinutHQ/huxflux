import React from "react"
import { cn } from "@huxflux/ui"
import { IconChevronDown } from "@tabler/icons-react"
import type { Agent } from "@huxflux/shared"
import { getFlag } from "@/lib/flags"
import { ThreadAgentsBar } from "./ThreadAgentsBar"
import { TeamAgentBar } from "./TeamAgentBar"
import { TasksBar } from "./TasksBar"
import { AskUserQuestionCard } from "./AskUserQuestionCard"
import { ChatInputBar } from "./ChatInputBar"
import { extractTeamAgents } from "../extract/teamAgents"
import { extractLatestTodos } from "../extract/todos"
import type { PendingQuestion } from "../chat.types"
import type { ChatInputBarProps } from "./chatInputBarTypes"

interface ChatBottomPanelProps {
  agent: Agent
  uiIsStreaming: boolean
  isAtBottom: boolean
  bottomRef: React.RefObject<HTMLDivElement | null>
  onScrollToBottom: () => void
  pendingQuestion: PendingQuestion | null
  onAnswerQuestion: (answers: Record<string, string>) => Promise<void> | void
  inputBarProps: ChatInputBarProps
}

export function ChatBottomPanel({ agent, uiIsStreaming, isAtBottom, bottomRef, onScrollToBottom, pendingQuestion, onAnswerQuestion, inputBarProps }: ChatBottomPanelProps) {
  return (
    <div className="shrink-0 relative">
      {!isAtBottom && agent.messages.length > 0 && (
        <button
          onClick={() => { onScrollToBottom(); bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }}
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
        <TasksBar todos={extractLatestTodos(agent.messages)} agentId={agent.id} isStreaming={uiIsStreaming} />
        {pendingQuestion && pendingQuestion.agentId === agent.id && pendingQuestion.questions.length > 0 && (
          <AskUserQuestionCard questions={pendingQuestion.questions} onSubmit={onAnswerQuestion} />
        )}
        <ChatInputBar {...inputBarProps} />
      </div>
    </div>
  )
}
