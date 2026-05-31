import { useState } from "react"
import { api, type PullRequest, useHuxfluxMutation } from "@huxflux/shared"
import { cn } from "@huxflux/ui"
import { IconFileCode, IconLoader2, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import type { PendingReviewComment } from "../pull-requests.types"
import { MarkdownContent } from "./MarkdownContent"

type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

const REVIEW_LABELS: Record<ReviewEvent, { title: string; desc: string }> = {
  COMMENT: { title: "Comment", desc: "Submit general feedback without explicit approval." },
  APPROVE: { title: "Approve", desc: "Submit feedback and approve merging these changes." },
  REQUEST_CHANGES: { title: "Request changes", desc: "Submit feedback suggesting changes." },
}

interface SubmitReviewPopoverProps {
  pr: PullRequest
  pendingComments: PendingReviewComment[]
  onClose: () => void
  onSubmitted: () => void
}

/** Popover that finishes a review: textarea + queued-comment list + verdict. */
export function SubmitReviewPopover({
  pr,
  pendingComments,
  onClose,
  onSubmitted,
}: SubmitReviewPopoverProps) {
  const [event, setEvent] = useState<ReviewEvent>("COMMENT")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submitMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.submitReview(pr.repoId!, pr.number, {
      event,
      body,
      comments: pendingComments
        .filter((c) => c.path && c.line > 0)
        .map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
          ...(c.startLine ? { start_line: c.startLine } : {}),
        })),
    }),
    onSuccess: () => {
      onSubmitted()
      onClose()
      toast.success("Review submitted to GitHub")
    },
    onError: (err) => setError((err as Error).message),
  })
  const submitting = submitMut.isPending

  function handleSubmit() {
    if (!pr.repoId) return
    setError(null)
    submitMut.mutate()
  }

  return (
    <div className="flex flex-col max-h-[80vh]">
      <SubmitReviewHeader onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a comment"
          rows={4}
          className="w-full text-[13px] bg-secondary/50 border border-input rounded-lg px-3 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring resize-none"
        />

        <SubmitReviewQueuedList pendingComments={pendingComments} />

        <SubmitReviewVerdict event={event} setEvent={setEvent} />

        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>

      <SubmitReviewFooter onClose={onClose} onSubmit={handleSubmit} disabled={submitting || !pr.repoId} submitting={submitting} />
    </div>
  )
}

function SubmitReviewHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <h2 className="text-[14px] font-semibold text-foreground">Finish your review</h2>
      <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
        <IconX size={15} />
      </button>
    </div>
  )
}

function SubmitReviewQueuedList({ pendingComments }: { pendingComments: PendingReviewComment[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide">
          {pendingComments.length} queued comment{pendingComments.length !== 1 ? "s" : ""}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {pendingComments.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/40 italic px-1">No inline comments queued.</p>
      ) : (
        <div className="space-y-2">
          {pendingComments.map((c) => (
            <QueuedCommentCard key={c.id} comment={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function QueuedCommentCard({ comment }: { comment: PendingReviewComment }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden text-[12px]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-secondary/40">
        <IconFileCode size={11} className="text-muted-foreground/40 shrink-0" />
        <code className="font-mono text-muted-foreground truncate flex-1">
          {comment.path}
          {comment.line > 0 && <span className="text-muted-foreground/40">:{comment.line}</span>}
        </code>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded border font-medium",
            comment.source === "agentic"
              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
              : "bg-secondary text-muted-foreground/60 border-border",
          )}
        >
          {comment.source}
        </span>
      </div>
      {comment.codeContext && comment.codeContext.length > 0 && (
        <div className="bg-[#0d0d0d] border-b border-border/50 overflow-x-auto max-h-20">
          <table className="min-w-full text-[10px] font-mono">
            <tbody>
              {comment.codeContext.map((line) => (
                <tr
                  key={line.lineNumber}
                  className={cn(line.highlighted ? "bg-amber-500/10 text-foreground" : "text-muted-foreground/40")}
                >
                  <td className="select-none text-right pr-2 pl-2 py-0.5 w-8 shrink-0 border-r border-border/30 text-muted-foreground/25 tabular-nums">
                    {line.lineNumber}
                  </td>
                  <td className="pl-2 pr-3 py-0.5 whitespace-pre">{line.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-3 py-2 text-[12px] text-foreground/80 leading-relaxed prose-sm">
        <MarkdownContent content={comment.body} />
      </div>
    </div>
  )
}

function SubmitReviewVerdict({
  event,
  setEvent,
}: {
  event: ReviewEvent
  setEvent: (e: ReviewEvent) => void
}) {
  return (
    <div className="space-y-1 border-t border-border pt-3">
      {(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const).map((opt) => {
        const l = REVIEW_LABELS[opt]
        return (
          <button
            key={opt}
            onClick={() => setEvent(opt)}
            className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left"
          >
            <div
              className={cn(
                "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center",
                event === opt ? "border-primary" : "border-muted-foreground/30",
              )}
            >
              {event === opt && <div className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-foreground">{l.title}</div>
              <div className="text-[12px] text-muted-foreground/60">{l.desc}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SubmitReviewFooter({
  onClose,
  onSubmit,
  disabled,
  submitting,
}: {
  onClose: () => void
  onSubmit: () => void
  disabled: boolean
  submitting: boolean
}) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
      <button
        onClick={onClose}
        className="text-[13px] font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-accent/50 transition-colors text-foreground"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="text-[13px] font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white transition-colors flex items-center gap-2"
      >
        {submitting && <IconLoader2 size={13} className="animate-spin" />}
        Submit review
      </button>
    </div>
  )
}
