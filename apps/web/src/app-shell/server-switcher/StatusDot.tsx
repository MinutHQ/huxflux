import { cn } from "@huxflux/ui"
import type { ServerStatus } from "@huxflux/shared"
import { STATUS_DOT_CLASS, STATUS_LABEL } from "./statusColor"

/**
 * Small colored dot indicating connection state for a server, paired with a
 * status label. Colors come from the Tailwind palette (amber/red/emerald)
 * deliberately, these are status hues, not theme tokens, and need to be
 * consistent across light/dark. `fixedWidth` reserves room for the longest
 * label so rows in a list stay aligned while statuses change.
 */
export function StatusDot({ status, fixedWidth, hideLabel }: { status: ServerStatus; fixedWidth?: boolean; hideLabel?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT_CLASS[status])} />
      {!hideLabel && <span className={cn("text-[11px] text-muted-foreground", fixedWidth && "min-w-[72px]")}>{STATUS_LABEL[status]}</span>}
    </span>
  )
}
