import { useRef } from "react"
import { cn } from "@huxflux/ui"
import type { PullRequest } from "@huxflux/shared"

interface PRRowProps {
  pr: PullRequest
  isSelected: boolean
  onClick: () => void
  onHover: (y: number) => void
  onLeave: () => void
}

/**
 * One row in the PR review list. Two-line layout: title + meta (number, author,
 * timestamp, base ← branch). A left border color encodes the row's review
 * state at a glance (amber = re-requested, emerald = approved, transparent
 * otherwise).
 */
export function PRRow({ pr, isSelected, onClick, onHover, onLeave }: PRRowProps) {
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) onHover(rect.top)
  }

  const statusBorderColor = pr.reviewRequested && pr.userReviewed
    ? "border-l-amber-400/60"
    : pr.reviewStatus === "approved"
    ? "border-l-emerald-400/60"
    : "border-l-transparent"

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      className="w-full min-w-0"
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full min-w-0 flex items-start gap-2.5 px-2 py-2 rounded-md transition-all text-left border-l-2",
          statusBorderColor,
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground"
        )}
      >
        {/* Avatar */}
        <div className="relative shrink-0 mt-0.5">
          {pr.authorAvatar ? (
            <img src={pr.authorAvatar} alt={pr.author} className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground/60 uppercase">
              {pr.author?.slice(0, 1) ?? "?"}
            </div>
          )}
        </div>
        {/* Text content */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* Title */}
          <span className={cn(
            "text-[12px] leading-snug truncate min-w-0",
            isSelected ? "font-semibold text-foreground" : "text-foreground/80",
            pr.unread && "font-semibold"
          )}>
            {pr.unread && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1.5 mb-0.5 shrink-0" />}
            {pr.title}
          </span>
          {/* Number + author + date */}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">#{pr.number}</span>
            {pr.author && <>
              <span className="text-[10px] text-muted-foreground/30 shrink-0">·</span>
              <span className="text-[10px] text-muted-foreground/60 truncate">{pr.author}</span>
            </>}
            <span className="text-[10px] text-muted-foreground/30 shrink-0">·</span>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">{pr.requestedAt}</span>
          </div>
          {/* Branch */}
          {(pr.baseBranch || pr.branch) && (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] font-mono text-muted-foreground/40 truncate">
                {pr.baseBranch} ← {pr.branch}
              </span>
            </div>
          )}
        </div>
      </button>
    </div>
  )
}
