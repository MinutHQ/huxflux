import { useState } from "react"
import { keepPreviousData } from "@tanstack/react-query"
import { api, getApiBase, queryKeys, useHuxfluxQuery, type ClaudeUsageSpend, type ClaudeUsageWindow } from "@huxflux/shared"
import { getSpendWindow, setSpendWindow, nextSpendWindow, type SpendWindow } from "@/lib/usagePrefs"

interface UsageRow extends ClaudeUsageWindow {
  label: string
}

const WINDOW_LABELS: Record<SpendWindow, string> = {
  hour: "1h",
  day: "24h",
  week: "7d",
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

// Render a minor-unit amount in its own currency. Intl throws on a currency
// code it doesn't recognise, so fall back to a plain suffixed number rather
// than taking the sidebar down with it.
function formatMoney(amountMinor: number, currency: string, exponent: number): string {
  const amount = amountMinor / 10 ** exponent
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(amount)
  } catch {
    return `${amount.toFixed(exponent)} ${currency}`
  }
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
 * Extra-usage spend beyond the plan limits, plus how much that total moved over
 * one trailing window. There is no bar here: Anthropic reports no spend cap for
 * most accounts, so there is usually no denominator to fill.
 *
 * Clicking cycles the window (1h → 24h → 7d). A window with no history behind
 * it yet shows the total alone rather than a placeholder — an empty space reads
 * as "nothing to say", which is the truth, where a dash reads as a broken value.
 *
 * A raw <button> rather than the Button primitive: this is a 10px dense text
 * row that has to align with the bar labels above it, and the primitive's
 * padding and sizing would break that alignment.
 */
function SpendRow({ spend }: { spend: ClaudeUsageSpend }) {
  const [window, setWindow] = useState<SpendWindow>(getSpendWindow)

  function handleClick() {
    const next = nextSpendWindow(window)
    setWindow(next)
    setSpendWindow(next)
  }

  const delta = spend.deltas[window]
  const total = formatMoney(spend.amountMinor, spend.currency, spend.exponent)

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Extra usage spent · change over the last ${WINDOW_LABELS[window]} (click to change window)`}
      className="flex w-full items-center justify-between rounded text-[10px] leading-none text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
    >
      <span className="font-medium">
        Extra usage <span className="text-sidebar-foreground/50">{WINDOW_LABELS[window]}</span>
      </span>
      <span className="tabular-nums">
        {total}
        {delta !== null ? (
          <span className="ml-1 text-sidebar-foreground/50">
            +{formatMoney(delta, spend.currency, spend.exponent)}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/**
 * Compact Claude.ai plan-usage readout for the sidebar header: two thin
 * progress bars (5-hour session window + 7-day weekly window) with the
 * percentage used and time until each window resets, plus an extra-usage row
 * once the account has spent beyond its plan limits. Polls every 60s.
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
    // Keep showing the last reading while a poll is in flight or comes back
    // empty, so a single transient failure doesn't blank the bars for up to a
    // minute until the next poll succeeds.
    placeholderData: keepPreviousData,
  })

  if (!data?.connected) return null

  const rows: UsageRow[] = [
    data.session ? { label: "Session", ...data.session } : null,
    data.weekly ? { label: "Weekly", ...data.weekly } : null,
  ].filter((r): r is UsageRow => r !== null)

  // Extra usage only matters once something has actually been spent — an account
  // that never exceeds its plan limits should not carry a permanent 0.00.
  const spend = data.spend && data.spend.amountMinor > 0 ? data.spend : null

  if (rows.length === 0 && !spend) return null

  return (
    <div className="flex w-full flex-col gap-1.5 px-2 py-1.5">
      {rows.map((row) => (
        <UsageBar key={row.label} {...row} />
      ))}
      {spend ? <SpendRow spend={spend} /> : null}
    </div>
  )
}
