import { cn } from "@huxflux/ui"
import type { PRComment, PRThread } from "@huxflux/shared"
import { PRThreadComment } from "./PRThreadComment"
import { PRThreadReplyBar } from "./PRThreadReplyBar"

interface PRThreadCardProps {
  thread: PRThread
  onAddToChat: (c: PRComment) => void
  onResolve: () => void
  onReply: (commentId: number, body: string) => Promise<void>
}

/** A single PR review thread (file/line discussion) with comments + reply footer. */
export function PRThreadCard({ thread, onAddToChat, onResolve, onReply }: PRThreadCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden min-w-0 transition-opacity",
        thread.isResolved ? "border-border/30 opacity-50" : "border-border/50",
      )}
    >
      {thread.comments.map((c, ci) => (
        <PRThreadComment key={c.id} comment={c} isFirst={ci === 0} onAddToChat={onAddToChat} />
      ))}
      <PRThreadReplyBar thread={thread} onResolve={onResolve} onReply={onReply} />
    </div>
  )
}
