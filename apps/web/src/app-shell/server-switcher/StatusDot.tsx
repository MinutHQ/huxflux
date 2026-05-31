import { cn } from "@huxflux/ui"
import type { ServerStatus } from "@huxflux/shared"

const STATUS_LABEL: Record<ServerStatus, string> = {
  online: "Online",
  offline: "Offline",
  checking: "Checking...",
  unauthorized: "Unauthorized",
}

/**
 * Small colored dot indicating connection state for a server, paired with a
 * status label. Colors come from the Tailwind palette (amber/red/emerald)
 * deliberately, these are status hues, not theme tokens, and need to be
 * consistent across light/dark.
 */
export function StatusDot({ status }: { status: ServerStatus }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          status === "online" && "bg-emerald-400",
          status === "offline" && "bg-red-400",
          status === "checking" && "bg-amber-400 animate-pulse",
          status === "unauthorized" && "bg-amber-400"
        )}
      />
      <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</span>
    </span>
  )
}
