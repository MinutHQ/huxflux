import React from "react"
import { cn } from "@huxflux/ui"
import {
  IconChevronUp,
  IconLoader2,
  IconPencil,
  IconX,
} from "@tabler/icons-react"
import type { Agent } from "@huxflux/shared"
import { MessageBubble } from "./MessageBubble"
import { TypingBubble } from "./TypingBubble"

interface QueuedMessage {
  id: string
  agentId: string
  display: string
}

interface ChatMessageListProps {
  agent: Agent
  uiIsStreaming: boolean
  elapsedSeconds: number
  hasMore: boolean
  isLoadingMore: boolean
  loadMore?: () => Promise<void>
  bottomRef: React.RefObject<HTMLDivElement | null>
  setScrollContainer: (el: HTMLDivElement | null) => void
  messageQueue: QueuedMessage[]
  onEditQueued: (qm: QueuedMessage) => void
  onRemoveQueued: (id: string) => void
}

function LoadMoreButton({ hasMore, isLoadingMore, loadMore }: { hasMore: boolean; isLoadingMore: boolean; loadMore?: () => Promise<void> }) {
  if (!hasMore) return null
  return (
    <div className="flex justify-center pb-4">
      <button
        onClick={loadMore}
        disabled={isLoadingMore}
        className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
      >
        {isLoadingMore ? <IconLoader2 size={13} className="animate-spin" /> : <IconChevronUp size={13} />}
        {isLoadingMore ? "Loading…" : "Load earlier messages"}
      </button>
    </div>
  )
}

function QueuedMessageBubble({ qm, onEdit, onRemove }: { qm: QueuedMessage; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="mb-5 group relative">
      <div className="bg-card border border-border rounded-xl px-5 py-4 opacity-50">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{qm.display}</p>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Edit queued message"
        >
          <IconPencil size={11} />
        </button>
        <button
          onClick={onRemove}
          className={cn(
            "p-1 rounded bg-card border border-border text-muted-foreground hover:text-red-400 transition-colors"
          )}
          title="Cancel queued message"
        >
          <IconX size={11} />
        </button>
      </div>
    </div>
  )
}

export function ChatMessageList({
  agent,
  uiIsStreaming,
  elapsedSeconds,
  hasMore,
  isLoadingMore,
  loadMore,
  bottomRef,
  setScrollContainer,
  messageQueue,
  onEditQueued,
  onRemoveQueued,
}: ChatMessageListProps) {
  return (
    <div ref={setScrollContainer} className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-10 py-8">
        <LoadMoreButton hasMore={hasMore} isLoadingMore={isLoadingMore} loadMore={loadMore} />
        {agent.messages.map((msg, i) => (
          <MessageBubble key={msg.id} msg={msg} isStreaming={uiIsStreaming && i === agent.messages.length - 1} />
        ))}
        {uiIsStreaming && <TypingBubble elapsedSeconds={elapsedSeconds} />}
        {messageQueue.filter((m) => m.agentId === agent.id).map((qm) => (
          <QueuedMessageBubble
            key={qm.id}
            qm={qm}
            onEdit={() => onEditQueued(qm)}
            onRemove={() => onRemoveQueued(qm.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
