import type { PRComment } from "@huxflux/shared"
import { MarkdownComment } from "./MarkdownComment"

interface PRThreadCommentProps {
  comment: PRComment
  isFirst: boolean
  onAddToChat: (c: PRComment) => void
}

/** Single comment row inside a PR review thread. */
export function PRThreadComment({ comment, isFirst, onAddToChat }: PRThreadCommentProps) {
  return (
    <div className={`group/comment px-3.5 py-2.5 min-w-0 @container${isFirst ? "" : " border-t border-border/30"}`}>
      <div className="flex items-center gap-2 mb-1.5 min-w-0">
        {comment.avatarUrl && (
          <img src={comment.avatarUrl} alt={comment.author} className="w-4 h-4 rounded-full shrink-0 ring-1 ring-border/50" />
        )}
        <span className="text-[11px] font-semibold text-foreground/90 shrink-0">{comment.author}</span>
        {comment.path && (
          <span
            className="text-[10px] text-muted-foreground/30 font-mono truncate"
            style={{ direction: "rtl", textAlign: "left" }}
          >
            {comment.path}{comment.line ? `:${comment.line}` : ""}
          </span>
        )}
        <button
          onClick={() => onAddToChat(comment)}
          className="opacity-0 group-hover/comment:opacity-100 text-[10px] text-muted-foreground/40 hover:text-foreground transition-all ml-auto px-1.5 py-0.5 rounded-md hover:bg-accent shrink-0"
          title="Add to chat"
        >
          + Chat
        </button>
      </div>
      <MarkdownComment body={comment.body} />
    </div>
  )
}
