import { useMemo } from "react"
import { IconCode } from "@tabler/icons-react"
import { useInView } from "../../hooks/useInView"

interface RepoPanelProps {
  repos: { id: string; name: string }[]
  agents: { repoId?: string | null }[]
}

/**
 * "Repositories" panel: one row per repo with a violet icon block, name,
 * agent count, and a small bar-chart preview hinting at activity volume.
 * The bar heights are random per-repo but cached in a useMemo so they stay
 * stable across re-renders.
 */
export function RepoPanel({ repos, agents }: RepoPanelProps) {
  const [ref, inView] = useInView<HTMLDivElement>()

  const repoRows = useMemo(() =>
    repos.map((repo) => {
      const agentCount = agents.filter((a) => a.repoId === repo.id).length
      const barCount = Math.min(agentCount, 7)
      const bars = Array.from({ length: barCount }, () => 40 + Math.random() * 60)
      return { repo, agentCount, bars }
    }),
    [repos, agents],
  )

  return (
    <div ref={ref} className="relative bg-card/80 backdrop-blur-xl border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <h2 className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Repositories</h2>
      {repoRows.length > 0 ? (
        <div className="relative space-y-1.5">
          {repoRows.map((row, i) => (
            <RepoRow key={row.repo.id} {...row} index={i} inView={inView} />
          ))}
        </div>
      ) : (
        <p className="relative text-[12px] text-muted-foreground/40">No repos configured</p>
      )}
    </div>
  )
}

interface RepoRowProps {
  repo: { id: string; name: string }
  agentCount: number
  bars: number[]
  index: number
  inView: boolean
}

function RepoRow({ repo, agentCount, bars, index, inView }: RepoRowProps) {
  return (
    <div
      className="flex items-center justify-between p-2.5 -mx-2 rounded-xl hover:bg-accent/30 transition-all duration-300 cursor-default group/repo"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? undefined : "translateY(12px) scale(0.97)",
        transitionDelay: `${index * 100}ms`,
        transitionDuration: "600ms",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 group-hover/repo:scale-110 group-hover/repo:rotate-6"
          style={{
            background: "linear-gradient(135deg, rgba(167, 139, 250, 0.15), rgba(167, 139, 250, 0.05))",
            border: "1px solid rgba(167, 139, 250, 0.1)",
          }}
        >
          <IconCode size={15} className="text-violet-400" />
        </div>
        <div>
          <span className="text-[13px] text-foreground font-semibold">{repo.name}</span>
          <div className="text-[10px] text-muted-foreground/30 font-medium">{agentCount} agent{agentCount !== 1 ? "s" : ""}</div>
        </div>
      </div>
      <div className="flex gap-[3px] items-end h-5">
        {bars.map((height, j) => (
          <div
            key={j}
            className="w-1.5 rounded-full transition-all duration-300"
            style={{
              height: `${height}%`,
              background: "rgba(167, 139, 250, 0.4)",
              transitionDelay: `${j * 50}ms`,
            }}
          />
        ))}
        {agentCount > 7 && <span className="text-[9px] text-muted-foreground/30 ml-1 font-bold">+{agentCount - 7}</span>}
      </div>
    </div>
  )
}
