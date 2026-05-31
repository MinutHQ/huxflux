import type { WorkspaceStats } from "@huxflux/shared"
import { useInView } from "../../hooks/useInView"
import { AnimatedNum } from "./AnimatedNum"

interface TokenPanelProps {
  stats: WorkspaceStats
}

interface TokenRow {
  label: string
  value: number
  color: string
}

/**
 * "Token usage" panel: four horizontal bars (input / output / cache read /
 * cache write) sized relative to the largest bucket. Each bar fades + slides
 * in 100ms apart once the panel enters the viewport.
 */
export function TokenPanel({ stats }: TokenPanelProps) {
  const [ref, inView] = useInView<HTMLDivElement>()

  const tokens: TokenRow[] = [
    { label: "Input", value: stats.messages.inputTokens, color: "rgb(96, 165, 250)" },
    { label: "Output", value: stats.messages.outputTokens, color: "rgb(52, 211, 153)" },
    { label: "Cache read", value: stats.messages.cacheReadTokens, color: "rgb(167, 139, 250)" },
    { label: "Cache write", value: stats.messages.cacheWriteTokens, color: "rgb(251, 191, 36)" },
  ]
  const maxToken = Math.max(...tokens.map((t) => t.value), 1)
  const totalTokens = tokens.reduce((s, t) => s + t.value, 0)

  return (
    <div ref={ref} className="relative bg-card/80 backdrop-blur-xl border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative flex items-center justify-between mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Token usage</h2>
        <AnimatedNum value={totalTokens} className="text-[11px] text-muted-foreground/30 tabular-nums font-bold" suffix=" total" />
      </div>
      <div className="relative space-y-4">
        {tokens.map((t, i) => (
          <TokenBar key={t.label} row={t} maxToken={maxToken} index={i} inView={inView} />
        ))}
      </div>
    </div>
  )
}

interface TokenBarProps {
  row: TokenRow
  maxToken: number
  index: number
  inView: boolean
}

function TokenBar({ row, maxToken, index, inView }: TokenBarProps) {
  const pct = (row.value / maxToken) * 100
  return (
    <div
      className="transition-all duration-600 ease-out"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateX(0)" : "translateX(-12px)",
        transitionDelay: `${index * 100}ms`,
      }}
    >
      <div className="flex justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: row.color, boxShadow: `0 0 6px ${row.color}60` }} />
          <span className="text-[11px] text-muted-foreground/60 font-medium">{row.label}</span>
        </div>
        <AnimatedNum value={row.value} className="text-[13px] font-bold text-foreground tabular-nums" />
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-muted/10">
        <div
          className="h-full rounded-full transition-all ease-out relative"
          style={{
            width: inView ? `${pct}%` : "0%",
            background: `linear-gradient(90deg, ${row.color}90, ${row.color}50)`,
            boxShadow: `0 0 8px ${row.color}40`,
            transitionDuration: `${1200 + index * 200}ms`,
          }}
        />
      </div>
    </div>
  )
}
