import type { PRComment } from "@huxflux/shared"
import { IconMessageCircle, IconX } from "@tabler/icons-react"

interface InlineCommentBubbleProps {
  comment: PRComment
  onRemoveComment?: (id: string) => void
}

/** Persisted-comment bubble rendered inline on a diff line via gutter annotation. */
export function InlineCommentBubble({ comment, onRemoveComment }: InlineCommentBubbleProps) {
  return (
    <div className="mx-2 my-1 rounded-xl border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <IconMessageCircle size={12} className="text-blue-400/60 shrink-0" />
        <span className="text-[11px] text-foreground/80 flex-1">{comment.body}</span>
        {onRemoveComment && (
          <button
            onClick={() => onRemoveComment(comment.id)}
            className="text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
          >
            <IconX size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
