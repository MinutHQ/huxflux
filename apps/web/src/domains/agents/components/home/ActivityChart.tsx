import { useMemo, useState } from "react"
import { useStagger } from "../../hooks/useStagger"

interface ActivityChartProps {
  data: { date: string; count: number }[]
}

/**
 * 30-day agent-activity bar chart. Fills missing days with zero counts so the
 * x-axis is always exactly 30 bars wide. Bars stagger up on mount and grow /
 * glow on hover; a tooltip shows the day's exact count + date.
 */
export function ActivityChart({ data }: ActivityChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const days = useMemo(() => {
    const lookup = new Map(data.map((d) => [d.date, d.count]))
    const result: { date: string; count: number }[] = []
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      result.push({ date: key, count: lookup.get(key) ?? 0 })
    }
    return result
  }, [data])

  const max = Math.max(...days.map((d) => d.count), 1)
  const barVisible = useStagger(30, 20)
  const first = days[0]
  if (!first) return null

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
      <div className="flex items-end gap-[3px] h-28">
        {days.map((d, i) => (
          <ActivityBar
            key={d.date}
            day={d}
            max={max}
            visible={barVisible[i] ?? false}
            hovered={hoveredIdx === i}
            index={i}
            onEnter={() => setHoveredIdx(i)}
            onLeave={() => setHoveredIdx(null)}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2.5">
        <span className="text-[9px] text-muted-foreground/25 font-medium">{first.date.slice(5)}</span>
        <span className="text-[9px] text-muted-foreground/25 font-medium">Today</span>
      </div>
    </div>
  )
}

interface ActivityBarProps {
  day: { date: string; count: number }
  max: number
  visible: boolean
  hovered: boolean
  index: number
  onEnter: () => void
  onLeave: () => void
}

function ActivityBar({ day, max, visible, hovered, index, onEnter, onLeave }: ActivityBarProps) {
  const h = day.count > 0 ? Math.max((day.count / max) * 100, 12) : 0
  return (
    <div
      className="flex-1 relative"
      style={{ height: "100%" }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className="absolute bottom-0 w-full rounded-t transition-all ease-out cursor-default"
        style={{
          height: visible ? (day.count > 0 ? `${h}%` : "2px") : "0px",
          transitionDuration: `${500 + index * 20}ms`,
          background: day.count > 0
            ? hovered
              ? "linear-gradient(to top, rgba(96, 165, 250, 0.9), rgba(139, 92, 246, 0.7))"
              : "linear-gradient(to top, rgba(96, 165, 250, 0.5), rgba(96, 165, 250, 0.2))"
            : "rgba(255,255,255,0.03)",
          boxShadow: hovered && day.count > 0 ? "0 0 16px rgba(96, 165, 250, 0.4)" : "none",
          transform: hovered && day.count > 0 ? "scaleX(1.4) scaleY(1.05)" : "scaleX(1)",
          transformOrigin: "bottom center",
          borderRadius: "3px 3px 0 0",
        }}
      />
      {hovered && day.count > 0 && (
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover/90 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1 shadow-2xl whitespace-nowrap z-10"
          style={{ animation: "homeSlotSpin 200ms ease-out" }}
        >
          <span className="text-[11px] font-bold text-foreground">{day.count}</span>
          <span className="text-[10px] text-muted-foreground/40 ml-1.5">{day.date.slice(5)}</span>
        </div>
      )}
    </div>
  )
}
