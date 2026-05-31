import { cn } from "@huxflux/ui"
import { statusConfig, type AgentStatus } from "@huxflux/shared"
import { useInView } from "../../hooks/useInView"
import { homeVisibleStatuses } from "./homeUtils"

interface StatusPanelProps {
  statusCounts: Record<string, number>
  totalAgents: number
}

/**
 * "By status" panel: a single stacked progress bar on top (each segment
 * coloured by status), then a list of rows with status name + count and a
 * per-status proportion bar. Rows stagger-fade in 120ms apart on enter.
 */
export function StatusPanel({ statusCounts, totalAgents }: StatusPanelProps) {
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <div ref={ref} className="relative bg-card/80 backdrop-blur-xl border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <h2 className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">By status</h2>

      {totalAgents > 0 && (
        <div className="relative flex gap-1 h-2.5 rounded-full overflow-hidden mb-5 bg-muted/10">
          {homeVisibleStatuses.map((status) => {
            const count = statusCounts[status] ?? 0
            if (count === 0) return null
            const pct = (count / totalAgents) * 100
            const cfg = statusConfig[status]
            return (
              <div
                key={status}
                className={cn("h-full transition-all duration-1200 ease-out first:rounded-l-full last:rounded-r-full", cfg.dotColor)}
                style={{ width: inView ? `${pct}%` : "0%" }}
              />
            )
          })}
        </div>
      )}

      <div className="relative space-y-3">
        {homeVisibleStatuses.map((status, i) => (
          <StatusRow
            key={status}
            status={status}
            count={statusCounts[status] ?? 0}
            totalAgents={totalAgents}
            index={i}
            inView={inView}
          />
        ))}
      </div>
    </div>
  )
}

interface StatusRowProps {
  status: AgentStatus
  count: number
  totalAgents: number
  index: number
  inView: boolean
}

function StatusRow({ status, count, totalAgents, index, inView }: StatusRowProps) {
  const cfg = statusConfig[status]
  const pct = totalAgents > 0 ? (count / totalAgents) * 100 : 0
  return (
    <div
      className="flex items-center gap-3 transition-all duration-600 ease-out group/row hover:translate-x-1"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? undefined : "translateX(-20px)",
        transitionDelay: `${index * 120}ms`,
      }}
    >
      <div className="flex items-center gap-2 w-24 shrink-0">
        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-300 group-hover/row:scale-150", cfg.dotColor)} />
        <span className={cn("text-[12px] font-medium", cfg.color)}>{cfg.label}</span>
      </div>
      <div className="flex-1 h-1.5 bg-muted/10 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-1000 ease-out", cfg.dotColor)}
          style={{ width: inView ? `${pct}%` : "0%" }}
        />
      </div>
      <span className="text-[12px] text-muted-foreground/60 w-6 text-right tabular-nums font-bold">{count}</span>
    </div>
  )
}
