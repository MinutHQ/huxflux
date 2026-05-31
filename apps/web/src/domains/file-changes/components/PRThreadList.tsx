import type { PRComment, PRThread } from "@huxflux/shared"
import { PRThreadCard } from "./PRThreadCard"

interface PRThreadListProps {
  threads: PRThread[]
  onAddToChat: (c: PRComment) => void
  onResolveThread: (threadId: string) => void
  onReply: (commentId: number, body: string) => Promise<void>
}

/** Section listing every review thread on the PR. */
export function PRThreadList({ threads, onAddToChat, onResolveThread, onReply }: PRThreadListProps) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Threads <span className="text-muted-foreground/50 normal-case font-normal">{threads.length}</span>
      </div>
      <div className="space-y-2.5 min-w-0">
        {threads.map((thread) => (
          <PRThreadCard
            key={thread.id}
            thread={thread}
            onAddToChat={onAddToChat}
            onResolve={() => onResolveThread(thread.id)}
            onReply={onReply}
          />
        ))}
      </div>
    </div>
  )
}
