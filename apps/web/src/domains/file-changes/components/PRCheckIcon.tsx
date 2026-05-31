import type { PRCheck } from "@huxflux/shared"
import { IconCircleCheck, IconCircleDashed, IconCircleX, IconClock } from "@tabler/icons-react"

/** Status icon for a single PR check row. */
export function PRCheckIcon({ check }: { check: PRCheck }) {
  if (check.status !== "completed") {
    return <IconClock size={14} className="text-amber-400 shrink-0" />
  }
  switch (check.conclusion) {
    case "success":
      return <IconCircleCheck size={14} className="text-emerald-400 shrink-0" />
    case "skipped":
    case "neutral":
      return <IconCircleDashed size={14} className="text-muted-foreground/50 shrink-0" />
    case null:
      return <IconClock size={14} className="text-amber-400 shrink-0" />
    default:
      return <IconCircleX size={14} className="text-red-400 shrink-0" />
  }
}
