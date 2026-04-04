import { useEffect, useState, useRef, useCallback } from "react"
import { api, useAgents, useRepos, type WorkspaceStats } from "@hive/shared"
import { statusConfig, type AgentStatus } from "@/data/mock"
import { cn } from "@hive/ui"
import {
  IconGitBranch,
  IconDatabase,
  IconSparkles,
  IconMessage,
  IconBolt,
  IconCode,
  IconPlus,
  IconMinus,
} from "@tabler/icons-react"

const visibleStatuses: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

// ── Animated counter hook ────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 1200): number {
  const [value, setValue] = useState(0)
  const ref = useRef({ start: 0, startTime: 0, raf: 0 })

  useEffect(() => {
    const r = ref.current
    r.start = value
    r.startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - r.startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(r.start + (target - r.start) * eased))
      if (progress < 1) r.raf = requestAnimationFrame(tick)
    }
    r.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(r.raf)
  }, [target, duration])

  return value
}

// ── Stagger entrance hook ────────────────────────────────────────────────────

function useStagger(count: number, delayMs = 80): boolean[] {
  const [visible, setVisible] = useState<boolean[]>(Array(count).fill(false))

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < count; i++) {
      timers.push(setTimeout(() => {
        setVisible((prev) => {
          const next = [...prev]
          next[i] = true
          return next
        })
      }, i * delayMs))
    }
    return () => timers.forEach(clearTimeout)
  }, [count, delayMs])

  return visible
}

// ── Intersection observer hook ───────────────────────────────────────────────

function useInView<T extends HTMLElement>(): [React.RefCallback<T>, boolean] {
  const [inView, setInView] = useState(false)
  const ref = useCallback((node: T | null) => {
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } },
      { threshold: 0.2 }
    )
    observer.observe(node)
  }, [])
  return [ref, inView]
}

// ── Main component ───────────────────────────────────────────────────────────

export function HomeView() {
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.getStats().then((s) => { setStats(s); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  const statusCounts = visibleStatuses.reduce<Record<string, number>>((acc, s) => {
    acc[s] = agents.filter((a) => a.status === s).length
    return acc
  }, {})

  const totalAgents = agents.length
  const heroVisible = useStagger(4, 100)

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div
          className="mb-10 transition-all duration-700"
          style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(-12px)" }}
        >
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground/60 mt-1">Lifetime workspace stats</p>
        </div>

        {/* Hero stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { icon: <IconGitBranch size={16} />, label: "Worktrees", value: stats?.agents.total ?? totalAgents, accent: "text-blue-400", bg: "bg-blue-500/10", glow: "group-hover:shadow-blue-500/20" },
            { icon: <IconDatabase size={16} />, label: "Repos", value: stats?.repos ?? repos.length, accent: "text-violet-400", bg: "bg-violet-500/10", glow: "group-hover:shadow-violet-500/20" },
            { icon: <IconMessage size={16} />, label: "Messages", value: stats?.messages.total ?? 0, accent: "text-emerald-400", bg: "bg-emerald-500/10", glow: "group-hover:shadow-emerald-500/20" },
            { icon: <IconBolt size={16} />, label: "Tool calls", value: stats?.toolCalls ?? 0, accent: "text-amber-400", bg: "bg-amber-500/10", glow: "group-hover:shadow-amber-500/20" },
          ].map((card, i) => (
            <HeroCard key={card.label} {...card} visible={heroVisible[i]} />
          ))}
        </div>

        {/* Token usage + Code changes row */}
        {stats && (
          <AnimatedSection delay={300}>
            <div className="grid grid-cols-2 gap-3 mb-8">
              <TokenPanel stats={stats} />
              <CodePanel stats={stats} />
            </div>
          </AnimatedSection>
        )}

        {/* Activity chart */}
        {stats && stats.dailyAgents.length > 0 && (
          <AnimatedSection delay={450}>
            <div className="bg-card border border-border rounded-xl p-5 mb-8 group hover:border-border/80 transition-colors duration-300">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Agent activity (30 days)</h2>
              <ActivityChart data={stats.dailyAgents} />
            </div>
          </AnimatedSection>
        )}

        {/* Status + Repos side by side */}
        <AnimatedSection delay={600}>
          <div className="grid grid-cols-2 gap-3">
            <StatusPanel statusCounts={statusCounts} totalAgents={totalAgents} />
            <RepoPanel repos={repos} agents={agents} />
          </div>
        </AnimatedSection>
      </div>
    </div>
  )
}

// ── Animated section wrapper ─────────────────────────────────────────────────

function AnimatedSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className="transition-all duration-700 ease-out"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Hero card ────────────────────────────────────────────────────────────────

function HeroCard({ icon, label, value, accent, bg, glow, visible }: {
  icon: React.ReactNode
  label: string
  value: number
  accent: string
  bg: string
  glow: string
  visible: boolean
}) {
  const animatedValue = useAnimatedNumber(visible ? value : 0)

  return (
    <div
      className={cn(
        "group bg-card border border-border rounded-xl p-4 flex flex-col gap-3",
        "hover:shadow-lg hover:scale-[1.02] hover:border-border/80",
        "transition-all duration-500 ease-out cursor-default",
        glow,
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
      }}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
        bg, accent,
      )}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
          {formatNum(animatedValue)}
        </div>
        <div className="text-[11px] text-muted-foreground/50 font-medium mt-0.5">{label}</div>
      </div>
    </div>
  )
}

// ── Token panel ──────────────────────────────────────────────────────────────

function TokenPanel({ stats }: { stats: WorkspaceStats }) {
  const tokens = [
    { label: "Input", value: stats.messages.inputTokens, color: "bg-blue-500/60" },
    { label: "Output", value: stats.messages.outputTokens, color: "bg-emerald-500/60" },
    { label: "Cache read", value: stats.messages.cacheReadTokens, color: "bg-violet-500/60" },
    { label: "Cache write", value: stats.messages.cacheWriteTokens, color: "bg-amber-500/60" },
  ]
  const maxToken = Math.max(...tokens.map((t) => t.value), 1)

  return (
    <div className="bg-card border border-border rounded-xl p-5 group hover:border-border/80 transition-colors duration-300">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Token usage</h2>
      <div className="space-y-3">
        {tokens.map((t) => {
          const pct = (t.value / maxToken) * 100
          return (
            <div key={t.label}>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-muted-foreground/50">{t.label}</span>
                <AnimatedNum value={t.value} className="text-[13px] font-semibold text-foreground tabular-nums" />
              </div>
              <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000 ease-out", t.color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Code changes panel ───────────────────────────────────────────────────────

function CodePanel({ stats }: { stats: WorkspaceStats }) {
  const total = stats.fileChanges.additions + stats.fileChanges.deletions
  const addPct = total > 0 ? (stats.fileChanges.additions / total) * 100 : 50

  return (
    <div className="bg-card border border-border rounded-xl p-5 group hover:border-border/80 transition-colors duration-300">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Code changes</h2>
      <div className="flex items-end gap-6 mb-5">
        <div>
          <AnimatedNum value={stats.fileChanges.total} className="text-2xl font-bold text-foreground tabular-nums" />
          <div className="text-[11px] text-muted-foreground/50">files changed</div>
        </div>
        <div className="flex items-center gap-3 text-[13px] pb-1">
          <span className="flex items-center gap-1 text-emerald-400">
            <IconPlus size={12} />
            <AnimatedNum value={stats.fileChanges.additions} />
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <IconMinus size={12} />
            <AnimatedNum value={stats.fileChanges.deletions} />
          </span>
        </div>
      </div>
      {total > 0 && (
        <div className="h-2.5 rounded-full overflow-hidden flex bg-muted/20">
          <div
            className="bg-emerald-500/70 h-full transition-all duration-1000 ease-out rounded-l-full"
            style={{ width: `${addPct}%` }}
          />
          <div className="bg-red-500/70 h-full flex-1 rounded-r-full" />
        </div>
      )}
    </div>
  )
}

// ── Animated number display ──────────────────────────────────────────────────

function AnimatedNum({ value, className }: { value: number; className?: string }) {
  const animated = useAnimatedNumber(value)
  return <span className={className}>{formatNum(animated)}</span>
}

// ── Status panel ─────────────────────────────────────────────────────────────

function StatusPanel({ statusCounts, totalAgents }: { statusCounts: Record<string, number>; totalAgents: number }) {
  const barVisible = useStagger(visibleStatuses.length, 120)

  return (
    <div className="bg-card border border-border rounded-xl p-5 group hover:border-border/80 transition-colors duration-300">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">By status</h2>
      <div className="space-y-3">
        {visibleStatuses.map((status, i) => {
          const cfg = statusConfig[status]
          const count = statusCounts[status] ?? 0
          const pct = totalAgents > 0 ? (count / totalAgents) * 100 : 0
          return (
            <div
              key={status}
              className="flex items-center gap-3 transition-all duration-500 ease-out"
              style={{
                opacity: barVisible[i] ? 1 : 0,
                transform: barVisible[i] ? "translateX(0)" : "translateX(-12px)",
              }}
            >
              <div className="flex items-center gap-2 w-24 shrink-0">
                <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotColor)} />
                <span className={cn("text-[12px] font-medium", cfg.color)}>{cfg.label}</span>
              </div>
              <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000 ease-out", cfg.dotColor)}
                  style={{ width: barVisible[i] ? `${pct}%` : "0%" }}
                />
              </div>
              <span className="text-[12px] text-muted-foreground/60 w-6 text-right tabular-nums">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Repo panel ───────────────────────────────────────────────────────────────

function RepoPanel({ repos, agents }: { repos: { id: string; name: string }[]; agents: { repoId?: string | null }[] }) {
  const itemVisible = useStagger(repos.length, 100)

  return (
    <div className="bg-card border border-border rounded-xl p-5 group hover:border-border/80 transition-colors duration-300">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Repositories</h2>
      {repos.length > 0 ? (
        <div className="space-y-2.5">
          {repos.map((repo, i) => {
            const agentCount = agents.filter((a) => a.repoId === repo.id).length
            return (
              <div
                key={repo.id}
                className="flex items-center justify-between transition-all duration-500 ease-out hover:translate-x-1"
                style={{
                  opacity: itemVisible[i] ? 1 : 0,
                  transform: itemVisible[i] ? undefined : "translateX(-8px)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                    <IconCode size={14} className="text-violet-400" />
                  </div>
                  <span className="text-[13px] text-foreground font-medium">{repo.name}</span>
                </div>
                <span className="text-[12px] text-muted-foreground/50 tabular-nums">{agentCount}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground/40">No repos configured</p>
      )}
    </div>
  )
}

// ── Activity chart ───────────────────────────────────────────────────────────

function ActivityChart({ data }: { data: { date: string; count: number }[] }) {
  const days: { date: string; count: number }[] = []
  const lookup = new Map(data.map((d) => [d.date, d.count]))
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, count: lookup.get(key) ?? 0 })
  }
  const max = Math.max(...days.map((d) => d.count), 1)
  const barVisible = useStagger(30, 30)

  return (
    <div className="flex items-end gap-[3px] h-20">
      {days.map((d, i) => {
        const h = d.count > 0 ? Math.max((d.count / max) * 100, 10) : 0
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.count} agent${d.count !== 1 ? "s" : ""}`}
            className={cn(
              "flex-1 rounded-sm transition-all duration-500 ease-out cursor-default",
              d.count > 0
                ? "bg-blue-500/50 hover:bg-blue-400/80 hover:scale-y-110"
                : "bg-muted/15 hover:bg-muted/30"
            )}
            style={{
              height: barVisible[i]
                ? d.count > 0 ? `${h}%` : "3px"
                : "0px",
              transformOrigin: "bottom",
            }}
          />
        )
      })}
    </div>
  )
}
