import { useState } from "react"
import { api, type PRThread, useHuxfluxMutation } from "@huxflux/shared"
import { cn } from "@huxflux/ui"
import {
  IconCheck,
  IconFileCode,
  IconLoader2,
  IconSend,
} from "@tabler/icons-react"
import { MarkdownContent } from "./MarkdownContent"
import { extractDiffHunk, relativeTime } from "../utils"

interface ThreadCardProps {
  thread: PRThread
  repoId: string
  prNumber: number
  fileDiffs: Record<string, string>
  currentUser?: string
  onReplied: (threadId: string, reply: PRThread["comments"][number]) => void
  onResolved: (threadId: string) => void
  onAttachToChat?: (thread: PRThread) => void
}

/**
 * Conversation-tab card for a single PR thread (path, comments, reply box,
 * optional "ask in chat" button, optional resolve action).
 */
export function ThreadCard({
  thread,
  repoId,
  prNumber,
  fileDiffs,
  currentUser,
  onReplied,
  onResolved,
  onAttachToChat,
}: ThreadCardProps) {
  const [replyText, setReplyText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const rootComment = thread.comments.find((c) => !c.isReply) ?? thread.comments[0]
  const canResolve = currentUser && rootComment?.author === currentUser

  const resolveMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.resolveThread(thread.id),
    onSuccess: () => onResolved(thread.id),
    onError: () => setError("Failed to resolve thread"),
  })

  const replyMut = useHuxfluxMutation<unknown, string>({
    mutationFn: (body) => api.prs.replyToComment(repoId, prNumber, rootComment!.databaseId!, body),
    onSuccess: (_data, body) => {
      const optimistic: PRThread["comments"][number] = {
        id: `local-${Date.now()}`,
        author: "you",
        body,
        createdAt: new Date().toISOString(),
        url: "",
        isReply: true,
        path: thread.path,
        line: thread.line,
      }
      onReplied(thread.id, optimistic)
      setReplyText("")
    },
    onError: () => setError("Failed to send reply"),
  })
  const sending = replyMut.isPending
  const resolving = resolveMut.isPending

  function handleResolve() {
    resolveMut.mutate()
  }

  function handleReply() {
    if (!replyText.trim() || sending || !rootComment?.databaseId) return
    setError(null)
    replyMut.mutate(replyText.trim())
  }

  const diffHunk = thread.path ? extractDiffHunk(fileDiffs[thread.path] ?? "", thread.line) : null

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {thread.path && (
        <div>
          <ThreadCardHeader thread={thread} onAttachToChat={onAttachToChat} />
          {diffHunk && <ThreadCardDiffHunk diffHunk={diffHunk} />}
        </div>
      )}
      <div className="divide-y divide-border/50">
        {thread.comments.map((c) => (
          <div key={c.id} className={cn("px-3 py-2.5", c.isReply && "bg-secondary/20")}>
            <ThreadCardCommentHeader
              avatarUrl={c.avatarUrl}
              author={c.author}
              createdAt={c.createdAt}
            />
            <div className="text-[12.5px] text-foreground/80 leading-relaxed pl-6.5">
              <MarkdownContent content={c.body} />
            </div>
          </div>
        ))}
      </div>
      {repoId && (
        <ThreadCardReplyBar
          replyText={replyText}
          setReplyText={(t) => {
            setReplyText(t)
            setError(null)
          }}
          sending={sending}
          resolving={resolving}
          canReply={!!rootComment?.databaseId}
          canResolve={!!canResolve}
          error={error}
          onSubmit={handleReply}
          onResolve={handleResolve}
        />
      )}
    </div>
  )
}

function ThreadCardHeader({
  thread,
  onAttachToChat,
}: {
  thread: PRThread
  onAttachToChat?: (thread: PRThread) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border/50">
      <IconFileCode size={11} className="text-muted-foreground/40 shrink-0" />
      <code className="text-[11px] font-mono text-muted-foreground truncate flex-1">
        {thread.path}
        {thread.line && <span className="text-muted-foreground/40">:{thread.line}</span>}
      </code>
      {onAttachToChat && (
        <button
          onClick={() => onAttachToChat(thread)}
          className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          Ask in chat
        </button>
      )}
    </div>
  )
}

function ThreadCardDiffHunk({ diffHunk }: { diffHunk: string }) {
  return (
    <div className="border-b border-border/50 overflow-x-auto bg-[#0d1117]">
      <pre className="text-[11px] font-mono leading-5 p-2">
        {diffHunk.split("\n").map((line, i) => {
          const color = line.startsWith("+")
            ? "text-emerald-400/90"
            : line.startsWith("-")
              ? "text-red-400/90"
              : line.startsWith("@@")
                ? "text-blue-400/70"
                : "text-muted-foreground/60"
          return (
            <div key={i} className={color}>
              {line || " "}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function ThreadCardCommentHeader({
  avatarUrl,
  author,
  createdAt,
}: {
  avatarUrl?: string
  author: string
  createdAt: string
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      {avatarUrl ? (
        <img src={avatarUrl} alt={author} className="w-5 h-5 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 text-[9px] font-semibold text-muted-foreground/60 uppercase">
          {author?.slice(0, 1) ?? "?"}
        </div>
      )}
      <span className="text-[12px] font-medium text-foreground">{author}</span>
      <span className="text-[11px] text-muted-foreground/40">{relativeTime(createdAt)}</span>
    </div>
  )
}

function ThreadCardReplyBar({
  replyText,
  setReplyText,
  sending,
  resolving,
  canReply,
  canResolve,
  error,
  onSubmit,
  onResolve,
}: {
  replyText: string
  setReplyText: (t: string) => void
  sending: boolean
  resolving: boolean
  canReply: boolean
  canResolve: boolean
  error: string | null
  onSubmit: () => void
  onResolve: () => void
}) {
  return (
    <div className="border-t border-border/50 px-3 py-2.5 bg-background/30">
      <div className="flex gap-2">
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Reply…"
          rows={1}
          disabled={sending}
          className="flex-1 text-[12px] bg-secondary/50 border border-input rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
        />
        <button
          onClick={onSubmit}
          disabled={!replyText.trim() || sending || !canReply}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 shrink-0"
        >
          {sending ? <IconLoader2 size={12} className="animate-spin" /> : <IconSend size={12} />}
        </button>
        {canResolve && (
          <button
            onClick={onResolve}
            disabled={resolving}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0 disabled:opacity-40"
            title="Resolve thread"
          >
            {resolving ? <IconLoader2 size={12} className="animate-spin" /> : <IconCheck size={12} />}
            Resolve
          </button>
        )}
      </div>
      {!canReply && <p className="text-[11px] text-muted-foreground/40 mt-1">Reply not available for this thread</p>}
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}
