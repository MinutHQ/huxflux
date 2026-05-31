import { useState } from "react"
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconClock,
  IconGitPullRequest,
} from "@tabler/icons-react"
import { cn, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import type { PRCheck, PRStatus } from "@huxflux/shared"

interface PRBadgesProps {
  prStatus: PRStatus
  agentId: string
}

interface BadgeState {
  label: string
  cls: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

function getReviewState(prStatus: PRStatus): BadgeState {
  if (prStatus.hasChangeRequests) {
    return { label: "Changes requested", cls: "text-orange-400 bg-orange-400/10 border-orange-400/30", icon: IconCircleX }
  }
  if (prStatus.mergeableState === "clean") {
    return { label: "Approved", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", icon: IconCircleCheck }
  }
  if (prStatus.mergeableState === "blocked") {
    return { label: "Review required", cls: "text-amber-400 bg-amber-400/10 border-amber-400/30", icon: IconAlertTriangle }
  }
  if (prStatus.draft) {
    return { label: "Draft", cls: "text-muted-foreground bg-muted/50 border-border", icon: IconCircleDashed }
  }
  return { label: "Pending", cls: "text-muted-foreground bg-muted/50 border-border", icon: IconClock }
}

function getCIState(checks: PRCheck[]): BadgeState | null {
  const successCount = checks.filter((c) => c.conclusion === "success").length
  const failedCount = checks.filter((c) => c.conclusion === "failure").length
  const pendingCount = checks.filter((c) => c.status !== "completed").length

  if (failedCount > 0) {
    return { icon: IconCircleX, cls: "text-red-400 bg-red-400/10 border-red-400/30", label: `${failedCount} failed` }
  }
  if (pendingCount > 0) {
    return { icon: IconClock, cls: "text-amber-400 bg-amber-400/10 border-amber-400/30", label: `${pendingCount} pending` }
  }
  if (checks.length > 0) {
    return { icon: IconCircleCheck, cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", label: `${successCount} passed` }
  }
  return null
}

function CheckIcon({ check }: { check: PRCheck }) {
  if (check.status !== "completed") return <IconClock size={12} className="text-amber-400 shrink-0" />
  if (check.conclusion === "success") return <IconCircleCheck size={12} className="text-emerald-400 shrink-0" />
  if (check.conclusion === "failure") return <IconCircleX size={12} className="text-red-400 shrink-0" />
  return <IconCircleDashed size={12} className="text-muted-foreground/60 shrink-0" />
}

/** Pill cluster: review state, optional CI status (with popover of each check), and PR number link. */
export function PRBadges({ prStatus, agentId }: PRBadgesProps) {
  const [ciOpen, setCiOpen] = useState(false)

  const { data: prDetails } = useHuxfluxQuery({
    queryKey: queryKeys.prs.details(agentId),
    queryFn: () => api.prs.details(agentId),
    staleTime: 30_000,
  })

  const reviewState = getReviewState(prStatus)
  const checks = prDetails?.checks ?? []
  const ciState = getCIState(checks)

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", reviewState.cls)}>
        <reviewState.icon size={10} />
        {reviewState.label}
      </span>

      {ciState && (
        <Popover open={ciOpen} onOpenChange={setCiOpen}>
          <PopoverTrigger asChild>
            <button className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer", ciState.cls)}>
              <ciState.icon size={10} />
              CI
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2" sideOffset={4}>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Checks</div>
            <div className="space-y-1">
              {checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckIcon check={check} />
                  <span className="text-[11px] text-foreground flex-1 truncate">{check.name}</span>
                  {check.url && (
                    <a href={check.url} target="_blank" rel="noreferrer" className="text-muted-foreground/40 hover:text-muted-foreground shrink-0">
                      <IconArrowUpRight size={10} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <a
        href={prStatus.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/50 border border-border transition-colors"
      >
        <IconGitPullRequest size={10} />
        #{prStatus.number}
      </a>
    </div>
  )
}
