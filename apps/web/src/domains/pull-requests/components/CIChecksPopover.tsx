import { useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLoader2,
} from "@tabler/icons-react"
import type { PullRequest } from "@huxflux/shared"

type Checks = NonNullable<PullRequest["checks"]>

/** Hover-popover summarising CI check status with per-check icons. */
export function CIChecksPopover({ checks }: { checks: Checks }) {
  const [show, setShow] = useState(false)
  const passing = checks.filter(
    (c) => c.conclusion === "success" || c.conclusion === "neutral" || c.conclusion === "skipped",
  ).length
  const failing = checks.filter(
    (c) =>
      c.conclusion === "failure" ||
      c.conclusion === "timed_out" ||
      c.conclusion === "action_required" ||
      c.conclusion === "cancelled",
  ).length
  const running = checks.filter((c) => c.status !== "completed").length

  const overallColor =
    failing > 0
      ? "text-red-400 bg-red-400/10 border-red-400/20"
      : running > 0
        ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
        : "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"

  if (checks.length === 0) return null

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border transition-colors",
          overallColor,
        )}
      >
        {failing > 0 ? <IconCircleX size={11} /> : running > 0 ? <IconClock size={11} /> : <IconCircleCheck size={11} />}
        {failing > 0 ? `${failing} failing` : running > 0 ? `${running} running` : `${passing} passing`}
      </button>
      {show && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-xl shadow-xl p-2 z-50 space-y-0.5">
          {checks.map((c, i) => {
            const icon =
              c.status !== "completed" ? (
                <IconLoader2 size={12} className="animate-spin text-yellow-400" />
              ) : c.conclusion === "success" ? (
                <IconCircleCheck size={12} className="text-emerald-400" />
              ) : c.conclusion === "failure" || c.conclusion === "timed_out" ? (
                <IconCircleX size={12} className="text-red-400" />
              ) : (
                <IconClock size={12} className="text-muted-foreground/50" />
              )
            return (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                {icon}
                <span className="text-[12px] text-foreground/80 flex-1 truncate">{c.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
