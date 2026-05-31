import type { PRIssueComment } from "@huxflux/shared"
import { MarkdownContent } from "./MarkdownContent"
import { relativeTime } from "../utils"

/** Renders a single general (non-line-anchored) PR comment. */
export function IssueCommentCard({ comment }: { comment: PRIssueComment }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        {comment.avatarUrl ? (
          <img
            src={comment.avatarUrl}
            alt={comment.author}
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 text-[10px] font-semibold text-muted-foreground/60 uppercase">
            {comment.author?.slice(0, 1) ?? "?"}
          </div>
        )}
        <span className="text-[12px] font-medium text-foreground">{comment.author}</span>
        <span className="text-[11px] text-muted-foreground/40">{relativeTime(comment.createdAt)}</span>
      </div>
      <div className="text-[12.5px] text-foreground/80 leading-relaxed pl-8">
        <MarkdownContent content={comment.body} />
      </div>
    </div>
  )
}
