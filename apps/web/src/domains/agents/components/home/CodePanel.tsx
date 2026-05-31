import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react"
import type { WorkspaceStats } from "@huxflux/shared"
import { useInView } from "../../hooks/useInView"
import { AnimatedNum } from "./AnimatedNum"

interface CodePanelProps {
  stats: WorkspaceStats
}

/**
 * "Code changes" panel: total files changed (big number), additions vs
 * deletions with their icons + counts, and a horizontal proportion bar
 * showing the additions/deletions split.
 */
export function CodePanel({ stats }: CodePanelProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const total = stats.fileChanges.additions + stats.fileChanges.deletions
  const addPct = total > 0 ? (stats.fileChanges.additions / total) * 100 : 50

  return (
    <div ref={ref} className="relative bg-card/80 backdrop-blur-xl border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <h2 className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Code changes</h2>
      <div className="relative flex items-end gap-6 mb-5">
        <div>
          <AnimatedNum value={stats.fileChanges.total} className="text-4xl font-black text-foreground tabular-nums tracking-tighter" />
          <div className="text-[11px] text-muted-foreground/50 font-medium">files changed</div>
        </div>
      </div>
      <div className="relative flex items-center gap-5 mb-4">
        <CodeStat
          color="rgba(52, 211, 153, 0.15)"
          glow="rgba(52, 211, 153, 0.1)"
          icon={<IconArrowUpRight size={13} className="text-emerald-400" />}
          value={stats.fileChanges.additions}
          textColor="text-emerald-400"
        />
        <CodeStat
          color="rgba(248, 113, 113, 0.15)"
          glow="rgba(248, 113, 113, 0.1)"
          icon={<IconArrowDownRight size={13} className="text-red-400" />}
          value={stats.fileChanges.deletions}
          textColor="text-red-400"
        />
      </div>
      {total > 0 && (
        <div className="relative h-3.5 rounded-full overflow-hidden flex bg-muted/10">
          <div
            className="h-full transition-all ease-out rounded-l-full relative"
            style={{
              width: inView ? `${addPct}%` : "0%",
              background: "linear-gradient(90deg, rgba(52, 211, 153, 0.8), rgba(52, 211, 153, 0.5))",
              boxShadow: "0 0 12px rgba(52, 211, 153, 0.3)",
              transitionDuration: "1400ms",
            }}
          />
          <div
            className="h-full flex-1 rounded-r-full transition-all ease-out"
            style={{
              background: "linear-gradient(90deg, rgba(248, 113, 113, 0.5), rgba(248, 113, 113, 0.8))",
              boxShadow: "0 0 12px rgba(248, 113, 113, 0.3)",
              opacity: inView ? 1 : 0,
              transitionDuration: "1400ms",
            }}
          />
        </div>
      )}
    </div>
  )
}

interface CodeStatProps {
  color: string
  glow: string
  icon: React.ReactNode
  value: number
  textColor: string
}

function CodeStat({ color, glow, icon, value, textColor }: CodeStatProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: color, boxShadow: `0 0 12px ${glow}` }}>
        {icon}
      </div>
      <AnimatedNum value={value} className={`text-[14px] font-bold ${textColor} tabular-nums`} />
    </div>
  )
}
