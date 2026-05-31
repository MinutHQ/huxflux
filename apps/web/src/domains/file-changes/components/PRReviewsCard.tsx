import { cn } from "@huxflux/ui"
import { IconCircleCheck, IconCircleDashed, IconCircleX } from "@tabler/icons-react"
import type { PRDetails } from "@huxflux/shared"

interface PRReviewsCardProps {
  pr: PRDetails
  onRerequestReview: (author: string) => void
}

function reviewStatusLabel(state: PRDetails["reviews"][number]["state"]): string {
  if (state === "APPROVED") return "Approved"
  if (state === "CHANGES_REQUESTED") return "Requested changes"
  if (state === "DISMISSED") return "Dismissed"
  return "Pending"
}

/** Top card in the AgentPRTab status stack: reviewer summary + per-reviewer list. */
export function PRReviewsCard({ pr, onRerequestReview }: PRReviewsCardProps) {
  const approvalCount = pr.reviews.filter((r) => r.state === "APPROVED").length
  const changesCount = pr.reviews.filter((r) => r.state === "CHANGES_REQUESTED").length
  const isBlocked = pr.mergeableState === "blocked"

  const headline = changesCount > 0
    ? "Changes requested"
    : isBlocked && approvalCount > 0
      ? "Review required"
      : approvalCount > 0
        ? "Approved"
        : "Review required"

  const summary = changesCount > 0
    ? `${changesCount} change${changesCount > 1 ? "s" : ""} requested`
    : approvalCount > 0 && isBlocked
      ? `${approvalCount} approval${approvalCount > 1 ? "s" : ""}, more required`
      : approvalCount > 0
        ? `${approvalCount} approving review${approvalCount > 1 ? "s" : ""}`
        : "No reviews yet"

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        {changesCount > 0 ? (
          <IconCircleX size={18} className="text-red-400 shrink-0 mt-0.5" />
        ) : isBlocked || approvalCount === 0 ? (
          <IconCircleDashed size={18} className="text-muted-foreground/50 shrink-0 mt-0.5" />
        ) : (
          <IconCircleCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground">{headline}</div>
          <div className="text-[11px] text-muted-foreground/60 mt-0.5">{summary}</div>
        </div>
      </div>

      {pr.reviews.length > 0 && (
        <div className="mt-2 ml-7 space-y-1.5">
          {pr.reviews.map((r) => (
            <div key={r.author} className="flex items-center gap-2">
              {r.avatarUrl ? (
                <img src={r.avatarUrl} alt={r.author} className="w-4 h-4 rounded-full shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-muted shrink-0" />
              )}
              <span className="text-[11px] font-medium text-foreground">{r.author}</span>
              <span className={cn(
                "text-[10px]",
                r.state === "APPROVED" && "text-emerald-400",
                r.state === "CHANGES_REQUESTED" && "text-red-400",
                (r.state === "PENDING" || r.state === "COMMENTED" || r.state === "DISMISSED") && "text-muted-foreground/50",
              )}>
                {reviewStatusLabel(r.state)}
              </span>
              {r.state === "CHANGES_REQUESTED" && !pr.merged && (
                <button
                  onClick={() => onRerequestReview(r.author)}
                  className="text-[10px] text-primary hover:underline ml-auto"
                >
                  re-request
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
