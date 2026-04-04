import { useEffect, useState, useRef, useCallback, useMemo } from "react"
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
  IconArrowUpRight,
  IconArrowDownRight,
  IconFlame,
} from "@tabler/icons-react"

const visibleStatuses: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

// ── Animated counter hook ────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 1400): number {
  const [value, setValue] = useState(0)
  const ref = useRef({ start: 0, startTime: 0, raf: 0 })

  useEffect(() => {
    const r = ref.current
    r.start = value
    r.startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - r.startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
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
      { threshold: 0.15 }
    )
    observer.observe(node)
  }, [])
  return [ref, inView]
}

// ── Sparkline component ──────────────────────────────────────────────────────

function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  const width = 120
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }))

  // Smooth curve via catmull-rom → cubic bezier
  let path = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }

  const gradientId = `spark-${color.replace(/[^a-z]/g, "")}`
  const areaPath = `${path} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" className="drop-shadow-sm" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={color} className="animate-pulse" />
    </svg>
  )
}

// ── Floating particles ───────────────────────────────────────────────────────

function Particles() {
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * -20,
      opacity: Math.random() * 0.15 + 0.05,
    })),
    []
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-primary/30"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animation: `homeFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
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
  const heroVisible = useStagger(4, 120)

  // Streak: consecutive days with agents created
  const streak = useMemo(() => {
    if (!stats?.dailyAgents.length) return 0
    const lookup = new Set(stats.dailyAgents.map((d) => d.date))
    let count = 0
    const d = new Date()
    while (true) {
      const key = d.toISOString().slice(0, 10)
      if (!lookup.has(key)) break
      count++
      d.setDate(d.getDate() - 1)
    }
    return count
  }, [stats?.dailyAgents])

  // Sparkline data from daily agents
  const sparkData = useMemo(() => {
    if (!stats?.dailyAgents.length) return []
    const lookup = new Map(stats.dailyAgents.map((d) => [d.date, d.count]))
    const days: number[] = []
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      days.push(lookup.get(d.toISOString().slice(0, 10)) ?? 0)
    }
    return days
  }, [stats?.dailyAgents])

  return (
    <div className="flex-1 h-full overflow-y-auto relative">
      <Particles />
      {/* Gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/[0.03] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-violet-500/[0.03] rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl mx-auto px-6 py-12 relative z-10">
        {/* Header with streak */}
        <div
          className="mb-10 transition-all duration-700"
          style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(-16px)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground/60 mt-1">Lifetime workspace stats</p>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-full px-3.5 py-1.5 animate-in fade-in slide-in-from-right-4 duration-500">
                <IconFlame size={16} className="text-orange-400 animate-pulse" />
                <span className="text-[13px] font-bold text-orange-400 tabular-nums">{streak}</span>
                <span className="text-[11px] text-orange-400/60">day streak</span>
              </div>
            )}
          </div>
        </div>

        {/* Hero stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { icon: <IconGitBranch size={16} />, label: "Worktrees", value: stats?.agents.total ?? totalAgents, accent: "text-blue-400", bg: "from-blue-500/15 to-blue-600/5", border: "hover:border-blue-500/30", glow: "hover:shadow-blue-500/10", ring: "bg-blue-500" },
            { icon: <IconDatabase size={16} />, label: "Repos", value: stats?.repos ?? repos.length, accent: "text-violet-400", bg: "from-violet-500/15 to-violet-600/5", border: "hover:border-violet-500/30", glow: "hover:shadow-violet-500/10", ring: "bg-violet-500" },
            { icon: <IconMessage size={16} />, label: "Messages", value: stats?.messages.total ?? 0, accent: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-600/5", border: "hover:border-emerald-500/30", glow: "hover:shadow-emerald-500/10", ring: "bg-emerald-500" },
            { icon: <IconBolt size={16} />, label: "Tool calls", value: stats?.toolCalls ?? 0, accent: "text-amber-400", bg: "from-amber-500/15 to-amber-600/5", border: "hover:border-amber-500/30", glow: "hover:shadow-amber-500/10", ring: "bg-amber-500" },
          ].map((card, i) => (
            <HeroCard key={card.label} {...card} visible={heroVisible[i]} sparkData={i === 0 ? sparkData : undefined} />
          ))}
        </div>

        {/* Token usage + Code changes row */}
        {stats && (
          <AnimatedSection delay={200}>
            <div className="grid grid-cols-2 gap-3 mb-8">
              <TokenPanel stats={stats} />
              <CodePanel stats={stats} />
            </div>
          </AnimatedSection>
        )}

        {/* Activity chart */}
        {stats && stats.dailyAgents.length > 0 && (
          <AnimatedSection delay={350}>
            <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-5 mb-8 group hover:border-border/80 transition-all duration-300 hover:shadow-lg hover:shadow-black/5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Agent activity (30 days)</h2>
                {stats.dailyAgents.length > 0 && (
                  <span className="text-[11px] text-muted-foreground/40">
                    {stats.dailyAgents.reduce((s, d) => s + d.count, 0)} total
                  </span>
                )}
              </div>
              <ActivityChart data={stats.dailyAgents} />
            </div>
          </AnimatedSection>
        )}

        {/* Status + Repos side by side */}
        <AnimatedSection delay={500}>
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
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Hero card ────────────────────────────────────────────────────────────────

function HeroCard({ icon, label, value, accent, bg, border, glow, ring, visible, sparkData }: {
  icon: React.ReactNode
  label: string
  value: number
  accent: string
  bg: string
  border: string
  glow: string
  ring: string
  visible: boolean
  sparkData?: number[]
}) {
  const animatedValue = useAnimatedNumber(visible ? value : 0)

  return (
    <div
      className={cn(
        "group relative bg-gradient-to-br border border-border rounded-xl p-4 flex flex-col gap-3 overflow-hidden",
        "hover:shadow-xl hover:scale-[1.03]",
        "transition-all duration-500 ease-out cursor-default",
        bg, border, glow,
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.92)",
      }}
    >
      {/* Subtle ring pulse */}
      <div className={cn("absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-[0.08] transition-opacity duration-500 blur-2xl", ring)} />

      <div className="flex items-start justify-between">
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
          "bg-gradient-to-br from-white/10 to-white/5 border border-white/10 shadow-inner",
          accent,
        )}>
          {icon}
        </div>
        {sparkData && sparkData.length > 1 && (
          <div className="opacity-60 group-hover:opacity-100 transition-opacity duration-300">
            <Sparkline data={sparkData} color="rgb(96, 165, 250)" height={28} />
          </div>
        )}
      </div>
      <div>
        <div className="text-3xl font-extrabold text-foreground tabular-nums tracking-tighter">
          {formatNum(animatedValue)}
        </div>
        <div className="text-[11px] text-muted-foreground/50 font-medium mt-0.5">{label}</div>
      </div>
    </div>
  )
}

// ── Token panel ──────────────────────────────────────────────────────────────

function TokenPanel({ stats }: { stats: WorkspaceStats }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const tokens = [
    { label: "Input", value: stats.messages.inputTokens, color: "bg-blue-500/70", track: "bg-blue-500/10" },
    { label: "Output", value: stats.messages.outputTokens, color: "bg-emerald-500/70", track: "bg-emerald-500/10" },
    { label: "Cache read", value: stats.messages.cacheReadTokens, color: "bg-violet-500/70", track: "bg-violet-500/10" },
    { label: "Cache write", value: stats.messages.cacheWriteTokens, color: "bg-amber-500/70", track: "bg-amber-500/10" },
  ]
  const maxToken = Math.max(...tokens.map((t) => t.value), 1)
  const totalTokens = tokens.reduce((s, t) => s + t.value, 0)

  return (
    <div ref={ref} className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-5 group hover:border-border/80 hover:shadow-lg hover:shadow-black/5 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Token usage</h2>
        <span className="text-[11px] text-muted-foreground/30 tabular-nums">{formatNum(totalTokens)} total</span>
      </div>
      <div className="space-y-3.5">
        {tokens.map((t, i) => {
          const pct = (t.value / maxToken) * 100
          return (
            <div
              key={t.label}
              className="transition-all duration-500 ease-out"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? "translateX(0)" : "translateX(-8px)",
                transitionDelay: `${i * 80}ms`,
              }}
            >
              <div className="flex justify-between mb-1.5">
                <span className="text-[11px] text-muted-foreground/50">{t.label}</span>
                <AnimatedNum value={t.value} className="text-[13px] font-bold text-foreground tabular-nums" />
              </div>
              <div className={cn("h-2 rounded-full overflow-hidden", t.track)}>
                <div
                  className={cn("h-full rounded-full transition-all duration-1200 ease-out", t.color)}
                  style={{ width: inView ? `${pct}%` : "0%" }}
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
  const [ref, inView] = useInView<HTMLDivElement>()
  const total = stats.fileChanges.additions + stats.fileChanges.deletions
  const addPct = total > 0 ? (stats.fileChanges.additions / total) * 100 : 50

  return (
    <div ref={ref} className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-5 group hover:border-border/80 hover:shadow-lg hover:shadow-black/5 transition-all duration-300">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Code changes</h2>
      <div className="flex items-end gap-6 mb-5">
        <div>
          <AnimatedNum value={stats.fileChanges.total} className="text-3xl font-extrabold text-foreground tabular-nums tracking-tighter" />
          <div className="text-[11px] text-muted-foreground/50">files changed</div>
        </div>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center">
            <IconArrowUpRight size={12} className="text-emerald-400" />
          </div>
          <AnimatedNum value={stats.fileChanges.additions} className="text-[13px] font-bold text-emerald-400 tabular-nums" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-red-500/15 flex items-center justify-center">
            <IconArrowDownRight size={12} className="text-red-400" />
          </div>
          <AnimatedNum value={stats.fileChanges.deletions} className="text-[13px] font-bold text-red-400 tabular-nums" />
        </div>
      </div>
      {total > 0 && (
        <div className="h-3 rounded-full overflow-hidden flex bg-muted/15 shadow-inner">
          <div
            className="bg-gradient-to-r from-emerald-500/80 to-emerald-400/60 h-full transition-all duration-1200 ease-out rounded-l-full"
            style={{ width: inView ? `${addPct}%` : "0%" }}
          />
          <div
            className="bg-gradient-to-r from-red-400/60 to-red-500/80 h-full transition-all duration-1200 ease-out flex-1 rounded-r-full"
            style={{ opacity: inView ? 1 : 0 }}
          />
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
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <div ref={ref} className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-5 group hover:border-border/80 hover:shadow-lg hover:shadow-black/5 transition-all duration-300">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">By status</h2>

      {/* Donut-style summary */}
      {totalAgents > 0 && (
        <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-5 shadow-inner bg-muted/15">
          {visibleStatuses.map((status) => {
            const count = statusCounts[status] ?? 0
            if (count === 0) return null
            const pct = (count / totalAgents) * 100
            const cfg = statusConfig[status]
            return (
              <div
                key={status}
                className={cn("h-full transition-all duration-1000 ease-out first:rounded-l-full last:rounded-r-full", cfg.dotColor)}
                style={{ width: inView ? `${pct}%` : "0%" }}
              />
            )
          })}
        </div>
      )}

      <div className="space-y-3">
        {visibleStatuses.map((status, i) => {
          const cfg = statusConfig[status]
          const count = statusCounts[status] ?? 0
          const pct = totalAgents > 0 ? (count / totalAgents) * 100 : 0
          return (
            <div
              key={status}
              className="flex items-center gap-3 transition-all duration-500 ease-out group/row hover:translate-x-0.5"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? undefined : "translateX(-16px)",
                transitionDelay: `${i * 100}ms`,
              }}
            >
              <div className="flex items-center gap-2 w-24 shrink-0">
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 transition-transform duration-300 group-hover/row:scale-125", cfg.dotColor)} />
                <span className={cn("text-[12px] font-medium", cfg.color)}>{cfg.label}</span>
              </div>
              <div className="flex-1 h-1.5 bg-muted/15 rounded-full overflow-hidden shadow-inner">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000 ease-out", cfg.dotColor)}
                  style={{ width: inView ? `${pct}%` : "0%" }}
                />
              </div>
              <span className="text-[12px] text-muted-foreground/60 w-6 text-right tabular-nums font-medium">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Repo panel ───────────────────────────────────────────────────────────────

function RepoPanel({ repos, agents }: { repos: { id: string; name: string }[]; agents: { repoId?: string | null }[] }) {
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <div ref={ref} className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-5 group hover:border-border/80 hover:shadow-lg hover:shadow-black/5 transition-all duration-300">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Repositories</h2>
      {repos.length > 0 ? (
        <div className="space-y-2">
          {repos.map((repo, i) => {
            const agentCount = agents.filter((a) => a.repoId === repo.id).length
            return (
              <div
                key={repo.id}
                className="flex items-center justify-between p-2 -mx-2 rounded-lg hover:bg-accent/40 transition-all duration-300 cursor-default group/repo"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? undefined : "translateY(8px)",
                  transitionDelay: `${i * 80}ms`,
                  transitionDuration: "500ms",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-violet-600/5 border border-violet-500/10 flex items-center justify-center transition-all duration-300 group-hover/repo:scale-110 group-hover/repo:rotate-3">
                    <IconCode size={14} className="text-violet-400" />
                  </div>
                  <div>
                    <span className="text-[13px] text-foreground font-medium">{repo.name}</span>
                    <div className="text-[10px] text-muted-foreground/30">{agentCount} agent{agentCount !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: Math.min(agentCount, 5) }).map((_, j) => (
                    <div key={j} className="w-1.5 h-4 rounded-full bg-violet-500/30" />
                  ))}
                  {agentCount > 5 && <span className="text-[10px] text-muted-foreground/30 ml-0.5">+{agentCount - 5}</span>}
                </div>
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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
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
  const barVisible = useStagger(30, 25)

  return (
    <div className="relative">
      <div className="flex items-end gap-[3px] h-24">
        {days.map((d, i) => {
          const h = d.count > 0 ? Math.max((d.count / max) * 100, 12) : 0
          const isHovered = hoveredIdx === i
          return (
            <div
              key={d.date}
              className="flex-1 relative group/bar"
              style={{ height: "100%" }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                className={cn(
                  "absolute bottom-0 w-full rounded-t-sm transition-all ease-out cursor-default",
                  d.count > 0
                    ? isHovered ? "bg-blue-400/90 shadow-lg shadow-blue-500/20" : "bg-blue-500/50"
                    : "bg-muted/10"
                )}
                style={{
                  height: barVisible[i]
                    ? d.count > 0 ? `${h}%` : "2px"
                    : "0px",
                  transitionDuration: `${400 + i * 15}ms`,
                  transform: isHovered && d.count > 0 ? "scaleX(1.3)" : "scaleX(1)",
                  transformOrigin: "bottom center",
                }}
              />
              {/* Tooltip */}
              {isHovered && d.count > 0 && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-md px-2 py-0.5 shadow-xl whitespace-nowrap z-10 animate-in fade-in zoom-in-95 duration-150">
                  <span className="text-[10px] font-medium text-foreground">{d.count}</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">{d.date.slice(5)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between mt-2">
        <span className="text-[9px] text-muted-foreground/30">{days[0].date.slice(5)}</span>
        <span className="text-[9px] text-muted-foreground/30">Today</span>
      </div>
    </div>
  )
}
