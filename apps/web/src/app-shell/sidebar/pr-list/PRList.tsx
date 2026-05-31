import { useState } from "react"
import { IconGitPullRequest } from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import type { PullRequest } from "@huxflux/shared"
import { PRGroup } from "./PRGroup"

interface PRListProps {
  prsLoading: boolean
  prs: PullRequest[]
  hideReviewedPrs: boolean
  selectedPrId: string | null
  onSelectPr: (id: string) => void
  onHover: (pr: PullRequest, y: number) => void
  onLeave: () => void
}

/**
 * Top-level renderer for the PR review pane: optional repo-filter pill row,
 * a loading skeleton, then three accordion groups (re-requested, review
 * requested, reviewed). The repo filter is local state because it's purely
 * a view convenience.
 */
export function PRList({ prsLoading, prs, hideReviewedPrs, selectedPrId, onSelectPr, onHover, onLeave }: PRListProps) {
  const [repoFilter, setRepoFilter] = useState<string | null>(null)

  if (prsLoading) {
    return (
      <div className="p-2 space-y-1">
        {[72, 88, 64, 80].map((w, i) => (
          <div key={i} className="px-2.5 py-1.5 space-y-1.5 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-muted/30 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 rounded bg-muted/50 animate-pulse" style={{ width: `${w}%` }} />
              <div className="h-2 rounded bg-muted/30 animate-pulse w-2/5" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Derive unique repo names for filter pills
  const repoNames = [...new Set(prs.map((p) => p.repo).filter(Boolean))]

  const filteredByRepo = repoFilter ? prs.filter((p) => p.repo === repoFilter) : prs
  const visiblePrs = hideReviewedPrs ? filteredByRepo.filter((p) => !p.isReadyToMerge) : filteredByRepo
  const reRequested = visiblePrs.filter((p) => p.reviewRequested && p.userReviewed)
  const toReview = visiblePrs.filter((p) => !p.userReviewed)
  const userReviewed = visiblePrs.filter((p) => p.userReviewed && !p.reviewRequested)

  return (
    <div className="flex flex-col">
      {/* Repo filter pills */}
      {repoNames.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-2 flex-wrap border-b border-sidebar-border">
          <button
            onClick={() => setRepoFilter(null)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
              repoFilter === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            )}
          >
            All
          </button>
          {repoNames.map((name) => (
            <button
              key={name}
              onClick={() => setRepoFilter(repoFilter === name ? null : name)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[120px]",
                repoFilter === name
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              )}
            >
              {name.split("/").pop() ?? name}
            </button>
          ))}
        </div>
      )}

      {visiblePrs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground/40">
          <IconGitPullRequest size={20} />
          <span className="text-[12px]">No PRs to review</span>
        </div>
      ) : (
        <div className="p-2 space-y-0.5">
          <PRGroup label="Re-requested" labelColor="text-amber-400/80" prs={reRequested} selectedPrId={selectedPrId} onSelectPr={onSelectPr} onHover={onHover} onLeave={onLeave} />
          <PRGroup label="Review requested" labelColor="text-muted-foreground/50" prs={toReview} selectedPrId={selectedPrId} onSelectPr={onSelectPr} onHover={onHover} onLeave={onLeave} />
          <PRGroup label="Reviewed" labelColor="text-muted-foreground/40" prs={userReviewed} selectedPrId={selectedPrId} onSelectPr={onSelectPr} onHover={onHover} onLeave={onLeave} defaultCollapsed />
        </div>
      )}
    </div>
  )
}
