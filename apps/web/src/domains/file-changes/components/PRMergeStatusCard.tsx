import { IconAlertTriangle, IconCircleCheck, IconCircleDashed } from "@tabler/icons-react"
import type { PRDetails } from "@huxflux/shared"

interface PRMergeStatusCardProps {
  pr: PRDetails
  isMergeable: boolean
}

/** Bottom card in the AgentPRTab status stack: mergeability summary. */
export function PRMergeStatusCard({ pr, isMergeable }: PRMergeStatusCardProps) {
  const icon = pr.merged ? (
    <IconCircleCheck size={18} className="text-purple-400 shrink-0 mt-0.5" />
  ) : pr.mergeableState === "dirty" ? (
    <IconAlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
  ) : pr.mergeableState === "blocked" ? (
    <IconAlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
  ) : isMergeable ? (
    <IconCircleCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
  ) : (
    <IconCircleDashed size={18} className="text-muted-foreground/50 shrink-0 mt-0.5" />
  )

  const headline = pr.merged
    ? "Merged"
    : pr.mergeableState === "dirty"
      ? "Merge conflict"
      : pr.mergeableState === "blocked"
        ? "Merging is blocked"
        : isMergeable
          ? "Ready to merge"
          : pr.draft
            ? "Draft"
            : "Pending"

  const summary = pr.merged
    ? "This PR has been merged"
    : pr.mergeableState === "dirty"
      ? "Resolve conflicts before merging"
      : pr.mergeableState === "blocked"
        ? "Requirements not met"
        : isMergeable
          ? "All checks passed and requirements met"
          : pr.draft
            ? "Mark as ready for review first"
            : "Waiting for reviews and checks"

  return (
    <div className="px-3 py-2.5 flex items-start gap-2.5">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-foreground">{headline}</div>
        <div className="text-[11px] text-muted-foreground/60 mt-0.5">{summary}</div>
      </div>
    </div>
  )
}
