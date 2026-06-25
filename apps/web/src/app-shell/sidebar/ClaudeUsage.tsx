import { api, getApiBase, queryKeys, useHuxfluxQuery, type ClaudeUsageWindow } from "@huxflux/shared"

interface UsageRow extends ClaudeUsageWindow {
  label: string
}

// Format the time until a window resets as a compact, human-readable string.
function formatReset(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return "now"
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

// Severity color tracks how much of the window is consumed. emerald/amber/red
// are design-system colors (the forbidden zinc/slate/gray scales are not used).
function fillClass(pct: number): string {
  if (pct >= 90) return "bg-red-500"
  if (pct >= 70) return "bg-amber-500"
  return "bg-emerald-500"
}

function UsageBar({ label, utilization, resetsAt }: UsageRow) {
  const pct = Math.max(0, Math.min(100, Math.round(utilization)))
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] leading-none text-sidebar-foreground/70">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">{pct}% · resets {formatReset(resetsAt)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-sidebar-accent">
        <div className={`h-full rounded-full transition-all ${fillClass(pct)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Compact Claude.ai plan-usage readout for the sidebar header: two thin
 * progress bars (5-hour session window + 7-day weekly window) with the
 * percentage used and time until each window resets. Polls every 60s.
 *
 * Renders nothing when no usage is available (no OAuth token, request failed,
 * or both windows absent) so the header stays empty rather than showing noise.
 */
export function ClaudeUsage() {
  const { data } = useHuxfluxQuery({
    queryKey: queryKeys.claudeUsage.current(getApiBase()),
    queryFn: () => api.claudeUsage.current(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  if (!data?.connected) return null

  const rows: UsageRow[] = [
    data.session ? { label: "Session", ...data.session } : null,
    data.weekly ? { label: "Weekly", ...data.weekly } : null,
  ].filter((r): r is UsageRow => r !== null)

  if (rows.length === 0) return null

  return (
    <div className="flex w-full flex-col gap-1.5 px-2 py-1.5">
      {rows.map((row) => (
        <UsageBar key={row.label} {...row} />
      ))}
    </div>
  )
}
