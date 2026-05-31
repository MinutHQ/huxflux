import { useState } from "react"
import { IconChevronRight } from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import type { PullRequest } from "@huxflux/shared"
import { PRRow } from "./PRRow"

interface PRGroupProps {
  label: string
  labelColor: string
  prs: PullRequest[]
  selectedPrId: string | null
  onSelectPr: (id: string) => void
  onHover: (pr: PullRequest, y: number) => void
  onLeave: () => void
  defaultCollapsed?: boolean
}

/**
 * Collapsible section inside the PR list. The "Reviewed" group renders
 * collapsed by default so the user lands on the actionable buckets first.
 * Renders nothing when the group has no PRs.
 */
export function PRGroup({ label, labelColor, prs, selectedPrId, onSelectPr, onHover, onLeave, defaultCollapsed = false }: PRGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  if (prs.length === 0) return null
  return (
    <div className="mb-0.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-sidebar-accent/40 rounded-md transition-colors"
      >
        <IconChevronRight
          size={12}
          className={cn("text-muted-foreground/40 transition-transform duration-150", !collapsed && "rotate-90")}
        />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", labelColor)}>{label}</span>
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-0.5 px-1 min-w-0 overflow-hidden">
          {prs.map((pr) => (
            <PRRow
              key={pr.id}
              pr={pr}
              isSelected={selectedPrId === pr.id}
              onClick={() => onSelectPr(pr.id)}
              onHover={(y) => onHover(pr, y)}
              onLeave={onLeave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
