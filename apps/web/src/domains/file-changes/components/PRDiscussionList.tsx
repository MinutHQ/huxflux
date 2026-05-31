import { IconArrowUpRight } from "@tabler/icons-react"
import type { PRComment, PRIssueComment } from "@huxflux/shared"
import { handleExternalClick } from "@/lib/platform"
import { MarkdownComment } from "./MarkdownComment"

interface PRDiscussionListProps {
  comments: PRIssueComment[]
  onAddToChat: (c: PRComment) => void
}

/** Section listing every non-thread "Conversation" comment on the PR. */
export function PRDiscussionList({ comments, onAddToChat }: PRDiscussionListProps) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Discussion <span className="text-muted-foreground/50 normal-case font-normal">{comments.length}</span>
      </div>
      <div className="space-y-2.5">
        {comments.map((c) => (
          <div key={c.id} className="group/comment rounded-xl border border-border/50 bg-card px-3.5 py-2.5 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {c.avatarUrl && (
                <img src={c.avatarUrl} alt={c.author} className="w-4 h-4 rounded-full ring-1 ring-border/50" />
              )}
              <span className="text-[11px] font-semibold text-foreground/90">{c.author}</span>
              <button
                onClick={() => onAddToChat({
                  id: String(c.id),
                  author: c.author,
                  avatarUrl: c.avatarUrl,
                  body: c.body,
                  createdAt: c.createdAt,
                  url: c.url,
                  isReply: false,
                })}
                className="opacity-0 group-hover/comment:opacity-100 text-[10px] text-muted-foreground/40 hover:text-foreground transition-all ml-auto px-1.5 py-0.5 rounded-md hover:bg-accent"
                title="Add to chat"
              >
                + Chat
              </button>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                onClick={handleExternalClick}
                className="text-muted-foreground/30 hover:text-muted-foreground/60"
              >
                <IconArrowUpRight size={11} />
              </a>
            </div>
            <MarkdownComment body={c.body} />
          </div>
        ))}
      </div>
    </div>
  )
}
