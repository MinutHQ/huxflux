import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconArrowUpRight, IconChevronDown, IconCircleCheck, IconCircleX, IconClock } from "@tabler/icons-react"
import type { PRDetails } from "@huxflux/shared"
import { handleExternalClick } from "@/lib/platform"
import { PRCheckIcon } from "./PRCheckIcon"

interface PRChecksCardProps {
  pr: PRDetails
}

/** Middle card in the AgentPRTab status stack: aggregate checks + expandable detail list. */
export function PRChecksCard({ pr }: PRChecksCardProps) {
  const [expanded, setExpanded] = useState(false)
  const successChecks = pr.checks.filter((c) => c.conclusion === "success").length
  const failedChecks = pr.checks.filter((c) => c.conclusion === "failure").length
  const pendingChecks = pr.checks.filter((c) => c.status !== "completed").length

  const headline = failedChecks > 0
    ? `${failedChecks} check${failedChecks > 1 ? "s" : ""} failed`
    : pendingChecks > 0
      ? "Checks in progress"
      : "All checks passed"

  const summaryParts: string[] = []
  if (successChecks > 0) summaryParts.push(`${successChecks} passed`)
  if (pendingChecks > 0) summaryParts.push(`${pendingChecks} pending`)
  if (failedChecks > 0) summaryParts.push(`${failedChecks} failed`)

  return (
    <div className="px-3 py-2.5">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-start gap-2.5 text-left">
        {failedChecks > 0 ? (
          <IconCircleX size={18} className="text-red-400 shrink-0 mt-0.5" />
        ) : pendingChecks > 0 ? (
          <IconClock size={18} className="text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <IconCircleCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground">{headline}</div>
          <div className="text-[11px] text-muted-foreground/60 mt-0.5">{summaryParts.join(", ")}</div>
        </div>
        <IconChevronDown
          size={13}
          className={cn("text-muted-foreground/40 shrink-0 mt-1 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="mt-2 ml-7 space-y-1">
          {pr.checks.map((check, i) => (
            <div key={i} className="flex items-center gap-2">
              <PRCheckIcon check={check} />
              <span className="text-[11px] text-foreground flex-1 truncate">{check.name}</span>
              {check.url && (
                <a
                  href={check.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleExternalClick}
                  className="text-muted-foreground/40 hover:text-muted-foreground"
                >
                  <IconArrowUpRight size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
