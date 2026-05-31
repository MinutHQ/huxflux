import { IconRefresh, IconSparkles } from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import { wrappedLengthLabels, wrappedPeriodLabels, type WrappedLength, type WrappedPeriod } from "./homeUtils"
import { useWrappedSummary } from "./useWrappedSummary"

/**
 * AI-generated "Wrapped" summary panel. Period selector (this week / last
 * week / last month / last year / custom), length selector (short / medium /
 * long), and a regenerate button. Skeleton on first load; dimmed previous
 * summary while regenerating. Fetch logic lives in `useWrappedSummary`.
 */
export function WrappedPanel() {
  const w = useWrappedSummary()
  const canRegenerate = !w.loading && !(w.period === "custom" && (!w.customFrom || !w.customTo))

  return (
    <div className="relative bg-card/80 backdrop-blur-xl border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/5">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <IconSparkles size={14} className="text-violet-400" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Wrapped</h2>
        </div>
        <button
          onClick={w.regenerate}
          disabled={!canRegenerate}
          title="Regenerate summary"
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 disabled:cursor-not-allowed",
            w.loading
              ? "bg-violet-500/15 text-violet-300 border-violet-500/25"
              : "bg-muted/10 text-muted-foreground/60 border-transparent hover:bg-muted/20 hover:text-muted-foreground/90 disabled:opacity-40",
          )}
        >
          <IconRefresh size={12} className={cn(w.loading && "animate-spin")} />
          {w.loading ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      <PeriodSelector value={w.period} onChange={w.setPeriod} />
      <LengthSelector value={w.length} onChange={w.setLength} />

      {w.period === "custom" && (
        <CustomDates
          from={w.customFrom}
          to={w.customTo}
          onFromChange={w.setCustomFrom}
          onToChange={w.setCustomTo}
          onSubmit={w.submitCustom}
          disabled={w.loading}
        />
      )}

      <WrappedContent loading={w.loading} error={w.error} summary={w.summary} onRetry={w.retry} />
    </div>
  )
}

function PeriodSelector({ value, onChange }: { value: WrappedPeriod; onChange: (v: WrappedPeriod) => void }) {
  return (
    <div className="relative flex flex-wrap items-center gap-1.5 mb-2">
      {(Object.keys(wrappedPeriodLabels) as WrappedPeriod[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200",
            value === p
              ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
              : "bg-muted/10 text-muted-foreground/50 border border-transparent hover:bg-muted/20 hover:text-muted-foreground/70",
          )}
        >
          {wrappedPeriodLabels[p]}
        </button>
      ))}
    </div>
  )
}

function LengthSelector({ value, onChange }: { value: WrappedLength; onChange: (v: WrappedLength) => void }) {
  return (
    <div className="relative flex items-center gap-1.5 mb-4">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mr-1">Length</span>
      {(Object.keys(wrappedLengthLabels) as WrappedLength[]).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={cn(
            "px-2 py-0.5 rounded-full text-[11px] font-medium transition-all duration-200",
            value === l
              ? "bg-blue-500/15 text-blue-300 border border-blue-500/25"
              : "bg-muted/10 text-muted-foreground/50 border border-transparent hover:bg-muted/20 hover:text-muted-foreground/70",
          )}
        >
          {wrappedLengthLabels[l]}
        </button>
      ))}
    </div>
  )
}

interface CustomDatesProps {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
}

function CustomDates({ from, to, onFromChange, onToChange, onSubmit, disabled }: CustomDatesProps) {
  return (
    <div className="relative flex items-center gap-2 mb-4">
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className="bg-muted/10 border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-foreground"
      />
      <span className="text-[11px] text-muted-foreground/40">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className="bg-muted/10 border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-foreground"
      />
      <button
        onClick={onSubmit}
        disabled={!from || !to || disabled}
        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30 transition-all duration-200 disabled:opacity-40"
      >
        Generate
      </button>
    </div>
  )
}

interface WrappedContentProps {
  loading: boolean
  error: string | null
  summary: string | null
  onRetry: () => void
}

function WrappedContent({ loading, error, summary, onRetry }: WrappedContentProps) {
  return (
    <div className="relative min-h-[60px]">
      {loading && !summary && <WrappedSkeleton />}
      {error && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-red-400/70">{error}</span>
          <button onClick={onRetry} className="text-[11px] text-violet-400 hover:text-violet-300 underline underline-offset-2">
            Retry
          </button>
        </div>
      )}
      {summary && (
        <div className={cn(
          "text-[13px] leading-relaxed whitespace-pre-line transition-opacity duration-300",
          loading ? "text-muted-foreground/40 animate-pulse" : "text-muted-foreground/80",
        )}>
          {summary}
        </div>
      )}
    </div>
  )
}

function WrappedSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 bg-muted/15 rounded-full w-full" />
      <div className="h-3 bg-muted/15 rounded-full w-[92%]" />
      <div className="h-3 bg-muted/15 rounded-full w-[85%]" />
      <div className="h-3 bg-muted/10 rounded-full w-full mt-5" />
      <div className="h-3 bg-muted/10 rounded-full w-[88%]" />
      <div className="h-3 bg-muted/10 rounded-full w-[70%]" />
    </div>
  )
}
