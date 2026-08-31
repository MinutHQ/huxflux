import { useEffect, useState } from "react"
import { keepPreviousData } from "@tanstack/react-query"
import { api, getApiBase, queryKeys, useHuxfluxQuery, type ClaudeUsageReason, type ClaudeUsageSpend, type ClaudeUsageWindow } from "@huxflux/shared"
import { getSpendWindow, setSpendWindow, nextSpendWindow, type SpendWindow } from "@/lib/usagePrefs"

interface UsageRow extends ClaudeUsageWindow {
  label: string
  /** Count down in minutes and seconds rather than a single coarse unit. */
  precise: boolean
}

const HOUR_MS = 60 * 60 * 1000

// What each failure reads as in the sidebar. `no-token` is absent on purpose:
// not being signed in means the feature does not apply rather than being
// broken, so nothing is rendered for it at all.
const REASON_LABELS: Partial<Record<ClaudeUsageReason, string>> = {
  "rate-limited": "rate limited",
  auth: "sign in again",
  unavailable: "unavailable",
}

const WINDOW_LABELS: Record<SpendWindow, string> = {
  hour: "1h",
  day: "24h",
  week: "7d",
}

/**
 * Format the time until a window resets.
 *
 * `precise` keeps two units all the way down instead of collapsing to one, so
 * the session row reads "2h 34m" and then "34m 12s" inside the final hour
 * rather than a lone "34m" that looks stalled. The weekly row stays coarse:
 * it resets days out, and seconds there would be noise.
 */
function formatReset(resetsAt: string, precise: boolean): string {
  const ms = new Date(resetsAt).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return "now"

  const totalSeconds = Math.floor(ms / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const days = Math.floor(hours / 24)

  if (precise && days < 1) {
    // Seconds are zero-padded so the countdown does not jitter in width as it
    // passes each ten-second mark.
    return hours >= 1
      ? `${hours}h ${totalMinutes % 60}m`
      : `${totalMinutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`
  }

  if (totalMinutes < 60) return `${totalMinutes}m`
  if (hours < 24) return `${hours}h`
  return `${days}d ${hours % 24}h`
}

/**
 * Re-render once a second while the given reset time is inside its final hour,
 * so a seconds countdown actually counts down. The query only refetches every
 * 60s, so without this the seconds would sit frozen and jump a whole minute.
 *
 * Outside that final hour no timer fires at all: the effect sleeps until the
 * hour mark and only then starts ticking. All of the timing happens here rather
 * than during render, because reading the clock while rendering makes the
 * output depend on when React happens to re-run the component.
 */
function useSecondTicker(resetsAt: string | undefined) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!resetsAt) return
    const target = new Date(resetsAt).getTime()
    let timer: ReturnType<typeof setTimeout> | undefined

    function schedule() {
      const remaining = target - Date.now()
      // A malformed timestamp yields NaN, which setTimeout coerces to 0 and
      // would spin this into a tight loop. Stop instead.
      if (!Number.isFinite(remaining) || remaining <= 0) return
      timer = remaining < HOUR_MS
        ? setTimeout(() => { setTick((t) => t + 1); schedule() }, 1000)
        : setTimeout(schedule, remaining - HOUR_MS)
    }

    schedule()
    return () => clearTimeout(timer)
  }, [resetsAt])
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

function UsageBar({ label, utilization, resetsAt, precise }: UsageRow) {
  const pct = Math.max(0, Math.min(100, Math.round(utilization)))
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] leading-none text-sidebar-foreground/70">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">{pct}% · resets {formatReset(resetsAt, precise)}</span>
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
 * A bar row with nothing behind it: an empty track and the reason where the
 * percentage would be. Keeping both rows in place means the sidebar does not
 * jump as readings come and go, and an empty track reads as "this exists, it
 * just has no data right now" where a vanished block reads as a bug.
 */
function GhostBar({ label, note }: { label: string, note: string }) {
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] leading-none text-sidebar-foreground/40">
        <span className="font-medium">{label}</span>
        <span>{note}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-sidebar-accent" />
    </div>
  )
}

/**
 * Compact Claude.ai plan-usage readout for the sidebar header: two thin
 * progress bars (5-hour session window + 7-day weekly window) with the
 * percentage used and time until each window resets, plus an extra-usage row
 * once the account has spent beyond its plan limits. Polls every 60s.
 *
 * Renders nothing when the account is simply not signed in. A real failure
 * (rate limit, bad token, network) shows empty ghost bars naming the reason,
 * so the readout does not silently disappear and look broken.
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

  // Must run before any early return so the hook order stays stable. Only the
  // session window counts down in seconds; weekly resets days out.
  useSecondTicker(data?.session?.resetsAt)

  if (!data) return null

  if (!data.connected) {
    // A reading that fails while a cached one exists is served from the cache
    // instead, so reaching here means there is genuinely nothing to show.
    const note = data.reason ? REASON_LABELS[data.reason] : undefined
    if (!note) return null
    return (
      <div className="flex w-full flex-col gap-1.5 px-2 py-1.5" title={data.error ?? undefined}>
        <GhostBar label="Session" note={note} />
        <GhostBar label="Weekly" note={note} />
      </div>
    )
  }

  const rows: UsageRow[] = [
    data.session ? { label: "Session", precise: true, ...data.session } : null,
    data.weekly ? { label: "Weekly", precise: false, ...data.weekly } : null,
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
