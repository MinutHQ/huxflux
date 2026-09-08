import { useEffect, useState } from "react"
import { IconBrandOpenai, IconAsterisk, IconInfinity } from "@tabler/icons-react"
import { api, getApiBase, queryKeys, useHuxfluxQuery, type ClaudeUsage, type ClaudeUsageSpend, type ClaudeUsageWindow } from "@huxflux/shared"
import { getSpendWindow, setSpendWindow, nextSpendWindow, type SpendWindow } from "@/lib/usagePrefs"

const HOUR_MS = 60 * 60 * 1000

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

function UsageRing({ utilization, label, color }: { utilization: number; label: string; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(utilization)))
  return (
    <div className="relative size-[36px] shrink-0" role="meter" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <svg viewBox="0 0 100 100" className={`size-full -rotate-90 ${color}`} aria-hidden="true">
        <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="10" className="text-sidebar-accent" />
        <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="10" pathLength="100" strokeDasharray={`${pct} 100`} strokeLinecap="round" opacity={pct === 0 ? 0 : 1} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[8px] font-medium leading-none tabular-nums">{pct}%</span>
      </div>
    </div>
  )
}

function UsageBar({ window, label, color }: { window: ClaudeUsageWindow | null; label: string; color: string }) {
  const pct = window ? Math.max(0, Math.min(100, Math.round(window.utilization))) : null
  return (
    <div>
      <div className="mb-1 flex justify-between gap-1 text-[10px]">
        <span className="text-sidebar-foreground/80">{label} <span className="ml-1 text-[9px] tabular-nums text-sidebar-foreground/60">
          {window ? `· resets in ${formatReset(window.resetsAt, label === "Session")}` : "· no limit"}
        </span></span>
        <span className="tabular-nums text-sidebar-foreground/60">{pct !== null ? `${pct}%` : "∞"}</span>
      </div>
      {pct !== null ? (
        <div role="meter" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
          <div className={`h-full rounded-full bg-current transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
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
      title={delta !== null ? `Total extra usage ${total} (click to change window)` : "Total extra usage; insufficient history for this window (click to change window)"}
      className="flex w-full flex-col items-end gap-1 rounded text-right text-[9px] leading-none text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
    >
      <span className="font-medium">
        Extra usage <span className="text-sidebar-foreground/50">{delta !== null ? WINDOW_LABELS[window] : "total"}</span>
      </span>
      <span className="tabular-nums">
        {delta !== null ? formatMoney(delta, spend.currency, spend.exponent) : total}
      </span>
    </button>
  )
}

function ProviderUsageCard({ provider, data }: { provider: "claude" | "codex"; data: ClaudeUsage | undefined }) {
  useSecondTicker(data?.session?.resetsAt)
  useSecondTicker(data?.weekly?.resetsAt)
  if (!data?.connected || (!data.session && !data.weekly && !data.spend)) return null
  const spend = data.spend && data.spend.amountMinor > 0 ? data.spend : null
  if (!data.session && !data.weekly && !spend) return null

  const color = provider === "claude" ? "text-orange-500" : "text-blue-500"
  const border = provider === "claude" ? "border-orange-500/25" : "border-blue-500/25"
  const ring = data.weekly

  return (
    <section aria-label={`${provider === "claude" ? "Claude" : "Codex"} usage`} className={`min-w-0 rounded-lg border ${border} bg-sidebar px-2 py-1.5 text-sidebar-foreground`}>
      <div className="mb-1.5 flex min-h-[36px] items-center gap-2">
        {ring ? <UsageRing utilization={ring.utilization} label="Weekly" color={color} /> : (
          <div className="flex size-[36px] shrink-0 items-center justify-center" role="img" aria-label="No weekly limit">
            <IconInfinity size={26} className={color} stroke={1.5} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px] font-medium">
            {provider === "claude" ? <IconAsterisk size={14} className="text-orange-500" /> : <IconBrandOpenai size={14} className="text-blue-500" />}
            {provider === "claude" ? "Claude" : "Codex"}
          </div>
          <div className="mt-0.5 text-[9px] leading-tight text-sidebar-foreground/60">
            {ring ? <>Weekly resets in <span className="tabular-nums">{formatReset(ring.resetsAt, false)}</span></> : "No weekly limit"}
          </div>
        </div>
        {spend ? <div className="min-w-0 max-w-[35%]"><SpendRow spend={spend} /></div> : null}
      </div>
      <UsageBar window={data.session} label="Session" color={color} />
    </section>
  )
}

export function ClaudeUsage() {
  const { data: claude } = useHuxfluxQuery({
    queryKey: queryKeys.claudeUsage.current(getApiBase()),
    queryFn: () => api.claudeUsage.current(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const { data: codex } = useHuxfluxQuery({
    queryKey: queryKeys.codexUsage.current(getApiBase()),
    queryFn: () => api.codexUsage.current(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  return (
    <div className="mx-2 grid max-w-[480px] grid-cols-1 auto-rows-fr gap-1.5 [&:has(section)]:my-2">
      <ProviderUsageCard provider="claude" data={claude} />
      <ProviderUsageCard provider="codex" data={codex} />
    </div>
  )
}
