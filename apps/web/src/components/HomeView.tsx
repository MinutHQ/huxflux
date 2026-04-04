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
  IconArrowUpRight,
  IconArrowDownRight,
  IconFlame,
  IconTrophy,
  IconRocket,
} from "@tabler/icons-react"

const visibleStatuses: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 1600): number {
  const [value, setValue] = useState(0)
  const ref = useRef({ start: 0, startTime: 0, raf: 0 })

  useEffect(() => {
    const r = ref.current
    r.start = value
    r.startTime = performance.now()
    const tick = (now: number) => {
      const elapsed = now - r.startTime
      const progress = Math.min(elapsed / duration, 1)
      // spring-like easing
      const eased = 1 - Math.pow(1 - progress, 5)
      setValue(Math.round(r.start + (target - r.start) * eased))
      if (progress < 1) r.raf = requestAnimationFrame(tick)
    }
    r.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(r.raf)
  }, [target, duration])

  return value
}

function useStagger(count: number, delayMs = 80): boolean[] {
  const [visible, setVisible] = useState<boolean[]>(Array(count).fill(false))
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < count; i++) {
      timers.push(setTimeout(() => {
        setVisible((prev) => { const next = [...prev]; next[i] = true; return next })
      }, i * delayMs))
    }
    return () => timers.forEach(clearTimeout)
  }, [count, delayMs])
  return visible
}

function useInView<T extends HTMLElement>(): [React.RefCallback<T>, boolean] {
  const [inView, setInView] = useState(false)
  const ref = useCallback((node: T | null) => {
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(node)
  }, [])
  return [ref, inView]
}

function useMouse(): { x: number; y: number } {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", handler, { passive: true })
    return () => window.removeEventListener("mousemove", handler)
  }, [])
  return pos
}

// ── Sparkline ────────────────────────────────────────────────────────────────

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

  let path = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    path += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`
  }

  const gId = `spark-${color.replace(/[^a-z0-9]/g, "")}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${gId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" className="drop-shadow-md" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      {/* Glow dot */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="5" fill={color} opacity="0.2" style={{ animation: "homeGlow 2s ease-in-out infinite" }} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={color} />
    </svg>
  )
}

// ── Floating particles ───────────────────────────────────────────────────────

function Particles() {
  const particles = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1.5,
      duration: Math.random() * 18 + 10,
      delay: Math.random() * -20,
      opacity: Math.random() * 0.35 + 0.1,
      hue: Math.random() * 80 + 200, // blue-violet-teal range
    })),
    []
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            background: `hsl(${p.hue}, 70%, 60%)`,
            boxShadow: `0 0 ${p.size * 4}px hsl(${p.hue}, 80%, 65%), 0 0 ${p.size * 8}px hsl(${p.hue}, 70%, 60%)`,
            animation: `homeFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ── Orbiting dots ────────────────────────────────────────────────────────────

function OrbitDots({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 6px ${color}`,
            opacity: 0.6,
            animation: `homeOrbit ${3 + i * 0.5}s linear ${i * -1}s infinite`,
            ["--orbit-r" as string]: `${size / 2 + 4}px`,
          }}
        />
      ))}
    </div>
  )
}

// ── Morphing blob ────────────────────────────────────────────────────────────

function MorphBlob({ color, className }: { color: string; className?: string }) {
  return (
    <div
      className={cn("absolute pointer-events-none", className)}
      style={{
        background: color,
        animation: "homeMorph 8s ease-in-out infinite, homeGlow 3s ease-in-out infinite",
        filter: "blur(80px)",
      }}
    />
  )
}

// ── Constellation canvas background ──────────────────────────────────────────

function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number; hue: number }[]>([])
  const rafRef = useRef(0)
  const mouseRef = useRef({ x: -1000, y: -1000 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.parentElement!.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    // Init nodes
    if (nodesRef.current.length === 0) {
      const w = canvas.parentElement!.clientWidth
      const h = canvas.parentElement!.clientHeight
      for (let i = 0; i < 80; i++) {
        nodesRef.current.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          r: Math.random() * 2.5 + 1,
          hue: Math.random() * 80 + 200, // blue-violet-teal
        })
      }
    }

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    window.addEventListener("mousemove", handleMouse, { passive: true })

    const draw = () => {
      const w = canvas.parentElement!.clientWidth
      const h = canvas.parentElement!.clientHeight
      ctx.clearRect(0, 0, w, h)

      const nodes = nodesRef.current
      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // Move nodes
      for (const n of nodes) {
        // Mouse repulsion
        const dx = n.x - mx
        const dy = n.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200 && dist > 0) {
          const force = (200 - dist) / 200 * 0.3
          n.vx += (dx / dist) * force
          n.vy += (dy / dist) * force
        }

        n.x += n.vx
        n.y += n.vy

        // Dampen
        n.vx *= 0.998
        n.vy *= 0.998

        // Wrap
        if (n.x < -20) n.x = w + 20
        if (n.x > w + 20) n.x = -20
        if (n.y < -20) n.y = h + 20
        if (n.y > h + 20) n.y = -20
      }

      // Draw connections
      const maxDist = 180
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.3
            const hue = (nodes[i].hue + nodes[j].hue) / 2
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `hsla(${hue}, 70%, 65%, ${alpha})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        // Outer glow
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 8)
        grad.addColorStop(0, `hsla(${n.hue}, 80%, 65%, 0.15)`)
        grad.addColorStop(1, `hsla(${n.hue}, 80%, 65%, 0)`)
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * 8, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()

        // Core dot
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${n.hue}, 80%, 75%, 0.6)`
        ctx.fill()
      }

      // Lines to nearby mouse
      for (const n of nodes) {
        const dx = n.x - mx
        const dy = n.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 250) {
          const alpha = (1 - dist / 250) * 0.4
          ctx.beginPath()
          ctx.moveTo(n.x, n.y)
          ctx.lineTo(mx, my)
          ctx.strokeStyle = `hsla(${n.hue}, 90%, 75%, ${alpha})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouse)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
}

// ── Aurora waves ─────────────────────────────────────────────────────────────

function AuroraBackground() {
  return (
    <div className="absolute inset-x-0 top-0 h-[600px] pointer-events-none overflow-hidden">
      <div
        className="absolute inset-x-0 -top-1/3 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(96, 165, 250, 0.15) 0%, rgba(96, 165, 250, 0.04) 50%, transparent 100%)",
          animation: "homeAurora1 10s ease-in-out infinite",
          filter: "blur(50px)",
        }}
      />
      <div
        className="absolute inset-x-0 -top-1/4 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(139, 92, 246, 0.12) 0%, rgba(139, 92, 246, 0.03) 50%, transparent 100%)",
          animation: "homeAurora2 13s ease-in-out infinite",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute inset-x-0 -top-1/5 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(52, 211, 153, 0.1) 0%, rgba(52, 211, 153, 0.02) 50%, transparent 100%)",
          animation: "homeAurora3 16s ease-in-out infinite",
          filter: "blur(55px)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(251, 191, 36, 0.06) 0%, transparent 40%)",
          animation: "homeAurora2 20s ease-in-out infinite reverse",
          filter: "blur(70px)",
        }}
      />
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function HomeView() {
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const [loaded, setLoaded] = useState(false)
  const mouse = useMouse()

  useEffect(() => {
    api.getStats().then((s) => { setStats(s); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  const statusCounts = visibleStatuses.reduce<Record<string, number>>((acc, s) => {
    acc[s] = agents.filter((a) => a.status === s).length
    return acc
  }, {})

  const totalAgents = agents.length
  const heroVisible = useStagger(4, 140)

  const streak = useMemo(() => {
    if (!stats?.dailyAgents.length) return 0
    const lookup = new Set(stats.dailyAgents.map((d) => d.date))
    let count = 0
    const d = new Date()
    while (lookup.has(d.toISOString().slice(0, 10))) { count++; d.setDate(d.getDate() - 1) }
    return count
  }, [stats?.dailyAgents])

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

  // Pick a fun achievement message
  const achievement = useMemo(() => {
    const t = stats?.toolCalls ?? 0
    const m = stats?.messages.total ?? 0
    if (t > 10000) return { icon: <IconTrophy size={14} />, text: "10k tool calls!" }
    if (m > 1000) return { icon: <IconRocket size={14} />, text: "1k messages!" }
    if (t > 1000) return { icon: <IconSparkles size={14} />, text: "1k tool calls!" }
    if (m > 100) return { icon: <IconRocket size={14} />, text: "100+ messages" }
    return null
  }, [stats])

  return (
    <div className="flex-1 h-full overflow-y-auto relative">
      <ConstellationBackground />
      <AuroraBackground />
      <Particles />

      {/* Morphing ambient blobs */}
      <MorphBlob color="rgba(59, 130, 246, 0.1)" className="w-[600px] h-[600px] -top-40 -left-20" />
      <MorphBlob color="rgba(139, 92, 246, 0.08)" className="w-[500px] h-[500px] top-1/3 -right-20" />
      <MorphBlob color="rgba(16, 185, 129, 0.07)" className="w-[450px] h-[450px] bottom-20 left-1/4" />
      <MorphBlob color="rgba(251, 191, 36, 0.05)" className="w-[400px] h-[400px] top-2/3 right-1/3" />

      {/* Mouse-following spotlight */}
      <div
        className="fixed w-[800px] h-[800px] rounded-full pointer-events-none z-0 transition-all duration-[1500ms] ease-out"
        style={{
          left: mouse.x - 400,
          top: mouse.y - 400,
          background: "radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, rgba(96, 165, 250, 0.04) 40%, transparent 70%)",
        }}
      />

      <div className="max-w-3xl mx-auto px-6 py-12 relative z-10">
        {/* Header */}
        <div
          className="mb-10 transition-all duration-1000"
          style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(-20px)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 tracking-tight pb-1" style={{ animation: "homeRainbow 8s linear infinite" }}>
                Dashboard
              </h1>
              <p className="text-sm text-muted-foreground/60 mt-1">Lifetime workspace stats</p>
            </div>
            <div className="flex items-center gap-2">
              {achievement && (
                <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-full px-3 py-1.5 text-amber-400 animate-in fade-in zoom-in-95 duration-700">
                  {achievement.icon}
                  <span className="text-[11px] font-bold">{achievement.text}</span>
                </div>
              )}
              {streak > 0 && (
                <div className="relative flex items-center gap-2 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-full px-3.5 py-1.5 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="absolute inset-0 rounded-full" style={{ animation: "homeGlow 2s ease-in-out infinite", background: "rgba(249, 115, 22, 0.05)" }} />
                  <IconFlame size={16} className="text-orange-400 relative" style={{ animation: "homeGlow 1.5s ease-in-out infinite" }} />
                  <span className="text-[15px] font-black text-orange-400 tabular-nums relative">{streak}</span>
                  <span className="text-[11px] text-orange-400/60 relative">day{streak > 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hero stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {([
            { icon: <IconGitBranch size={18} />, label: "Worktrees", value: stats?.agents.total ?? totalAgents, color: "rgb(96, 165, 250)", colorClass: "blue" },
            { icon: <IconDatabase size={18} />, label: "Repos", value: stats?.repos ?? repos.length, color: "rgb(167, 139, 250)", colorClass: "violet" },
            { icon: <IconMessage size={18} />, label: "Messages", value: stats?.messages.total ?? 0, color: "rgb(52, 211, 153)", colorClass: "emerald" },
            { icon: <IconBolt size={18} />, label: "Tool calls", value: stats?.toolCalls ?? 0, color: "rgb(251, 191, 36)", colorClass: "amber" },
          ] as const).map((card, i) => (
            <HeroCard key={card.label} {...card} visible={heroVisible[i]} sparkData={i === 0 ? sparkData : undefined} />
          ))}
        </div>

        {/* Token + Code row */}
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
            <div className="relative bg-card/60 backdrop-blur-md border border-border rounded-xl p-5 mb-8 overflow-hidden group hover:border-border/80 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5">
              <div className="home-shimmer absolute inset-0 pointer-events-none" />
              <div className="relative flex items-center justify-between mb-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Agent activity (30 days)</h2>
                <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                  {stats.dailyAgents.reduce((s, d) => s + d.count, 0)} total
                </span>
              </div>
              <div className="relative">
                <ActivityChart data={stats.dailyAgents} />
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* Status + Repos */}
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
        transform: inView ? "translateY(0) scale(1)" : "translateY(30px) scale(0.98)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Hero card ────────────────────────────────────────────────────────────────

function HeroCard({ icon, label, value, color, colorClass, visible, sparkData }: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  colorClass: string
  visible: boolean
  sparkData?: number[]
}) {
  const animatedValue = useAnimatedNumber(visible ? value : 0)
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const handleMouse = useCallback((e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -12
    setTilt({ x, y })
  }, [])

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouse}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      className={cn(
        "group relative border border-border rounded-xl p-4 flex flex-col gap-3 overflow-hidden cursor-default",
        `hover:border-${colorClass}-500/30 hover:shadow-xl hover:shadow-${colorClass}-500/10`,
        "transition-shadow duration-500",
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? `perspective(600px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) scale(1)`
          : "perspective(600px) translateY(24px) scale(0.9)",
        transition: "opacity 600ms, transform 400ms ease-out",
        background: `linear-gradient(135deg, ${color}10 0%, transparent 60%)`,
      }}
    >
      {/* Animated border glow on hover */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `conic-gradient(from var(--home-border-angle, 0deg), transparent 40%, ${color}30 50%, transparent 60%)`,
          animation: "homeBorderRotate 3s linear infinite",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          padding: "1px",
          borderRadius: "inherit",
        }}
      />

      {/* Shimmer sweep */}
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Glow orb */}
      <div
        className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 blur-3xl"
        style={{ background: color, opacity: "inherit" }}
      />

      <div className="relative flex items-start justify-between">
        <div className="relative">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6"
            style={{
              background: `linear-gradient(135deg, ${color}25, ${color}10)`,
              border: `1px solid ${color}20`,
              boxShadow: `0 0 0 0 ${color}00`,
              color,
            }}
          >
            {icon}
          </div>
          {/* Orbit dots on hover */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <OrbitDots color={color} size={44} />
          </div>
        </div>
        {sparkData && sparkData.length > 1 && (
          <div className="opacity-40 group-hover:opacity-100 transition-opacity duration-500">
            <Sparkline data={sparkData} color={color} height={32} />
          </div>
        )}
      </div>

      <div className="relative">
        <div
          className="text-4xl font-black tabular-nums tracking-tighter"
          style={{ color }}
        >
          {formatNum(animatedValue)}
        </div>
        <div className="text-[11px] text-muted-foreground/50 font-semibold uppercase tracking-wider mt-1">{label}</div>
      </div>
    </div>
  )
}

// ── Token panel ──────────────────────────────────────────────────────────────

function TokenPanel({ stats }: { stats: WorkspaceStats }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const tokens = [
    { label: "Input", value: stats.messages.inputTokens, color: "rgb(96, 165, 250)", bg: "bg-blue-500" },
    { label: "Output", value: stats.messages.outputTokens, color: "rgb(52, 211, 153)", bg: "bg-emerald-500" },
    { label: "Cache read", value: stats.messages.cacheReadTokens, color: "rgb(167, 139, 250)", bg: "bg-violet-500" },
    { label: "Cache write", value: stats.messages.cacheWriteTokens, color: "rgb(251, 191, 36)", bg: "bg-amber-500" },
  ]
  const maxToken = Math.max(...tokens.map((t) => t.value), 1)
  const totalTokens = tokens.reduce((s, t) => s + t.value, 0)

  return (
    <div ref={ref} className="relative bg-card/60 backdrop-blur-md border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative flex items-center justify-between mb-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Token usage</h2>
        <AnimatedNum value={totalTokens} className="text-[11px] text-muted-foreground/30 tabular-nums font-bold" suffix=" total" />
      </div>
      <div className="relative space-y-4">
        {tokens.map((t, i) => {
          const pct = (t.value / maxToken) * 100
          return (
            <div
              key={t.label}
              className="transition-all duration-600 ease-out"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? "translateX(0)" : "translateX(-12px)",
                transitionDelay: `${i * 100}ms`,
              }}
            >
              <div className="flex justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: t.color, boxShadow: `0 0 6px ${t.color}60` }} />
                  <span className="text-[11px] text-muted-foreground/60 font-medium">{t.label}</span>
                </div>
                <AnimatedNum value={t.value} className="text-[13px] font-bold text-foreground tabular-nums" />
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-muted/10">
                <div
                  className="h-full rounded-full transition-all ease-out relative"
                  style={{
                    width: inView ? `${pct}%` : "0%",
                    background: `linear-gradient(90deg, ${t.color}90, ${t.color}50)`,
                    boxShadow: `0 0 8px ${t.color}40`,
                    transitionDuration: `${1200 + i * 200}ms`,
                  }}
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
    <div ref={ref} className="relative bg-card/60 backdrop-blur-md border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <h2 className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Code changes</h2>
      <div className="relative flex items-end gap-6 mb-5">
        <div>
          <AnimatedNum value={stats.fileChanges.total} className="text-4xl font-black text-foreground tabular-nums tracking-tighter" />
          <div className="text-[11px] text-muted-foreground/50 font-medium">files changed</div>
        </div>
      </div>
      <div className="relative flex items-center gap-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(52, 211, 153, 0.15)", boxShadow: "0 0 12px rgba(52, 211, 153, 0.1)" }}>
            <IconArrowUpRight size={13} className="text-emerald-400" />
          </div>
          <AnimatedNum value={stats.fileChanges.additions} className="text-[14px] font-bold text-emerald-400 tabular-nums" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(248, 113, 113, 0.15)", boxShadow: "0 0 12px rgba(248, 113, 113, 0.1)" }}>
            <IconArrowDownRight size={13} className="text-red-400" />
          </div>
          <AnimatedNum value={stats.fileChanges.deletions} className="text-[14px] font-bold text-red-400 tabular-nums" />
        </div>
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

// ── Animated number display ──────────────────────────────────────────────────

function AnimatedNum({ value, className, suffix }: { value: number; className?: string; suffix?: string }) {
  const animated = useAnimatedNumber(value)
  return <span className={className}>{formatNum(animated)}{suffix}</span>
}

// ── Status panel ─────────────────────────────────────────────────────────────

function StatusPanel({ statusCounts, totalAgents }: { statusCounts: Record<string, number>; totalAgents: number }) {
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <div ref={ref} className="relative bg-card/60 backdrop-blur-md border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <h2 className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">By status</h2>

      {totalAgents > 0 && (
        <div className="relative flex gap-1 h-2.5 rounded-full overflow-hidden mb-5 bg-muted/10">
          {visibleStatuses.map((status) => {
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
        {visibleStatuses.map((status, i) => {
          const cfg = statusConfig[status]
          const count = statusCounts[status] ?? 0
          const pct = totalAgents > 0 ? (count / totalAgents) * 100 : 0
          return (
            <div
              key={status}
              className="flex items-center gap-3 transition-all duration-600 ease-out group/row hover:translate-x-1"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? undefined : "translateX(-20px)",
                transitionDelay: `${i * 120}ms`,
              }}
            >
              <div className="flex items-center gap-2 w-24 shrink-0">
                <span
                  className={cn("w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-300 group-hover/row:scale-150", cfg.dotColor)}
                  style={{ boxShadow: count > 0 ? undefined : undefined }}
                />
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
        })}
      </div>
    </div>
  )
}

// ── Repo panel ───────────────────────────────────────────────────────────────

function RepoPanel({ repos, agents }: { repos: { id: string; name: string }[]; agents: { repoId?: string | null }[] }) {
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <div ref={ref} className="relative bg-card/60 backdrop-blur-md border border-border rounded-xl p-5 overflow-hidden group hover:border-border/80 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <h2 className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Repositories</h2>
      {repos.length > 0 ? (
        <div className="relative space-y-1.5">
          {repos.map((repo, i) => {
            const agentCount = agents.filter((a) => a.repoId === repo.id).length
            return (
              <div
                key={repo.id}
                className="flex items-center justify-between p-2.5 -mx-2 rounded-xl hover:bg-accent/30 transition-all duration-300 cursor-default group/repo"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? undefined : "translateY(12px) scale(0.97)",
                  transitionDelay: `${i * 100}ms`,
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
                  {Array.from({ length: Math.min(agentCount, 7) }).map((_, j) => (
                    <div
                      key={j}
                      className="w-1.5 rounded-full transition-all duration-300"
                      style={{
                        height: `${40 + Math.random() * 60}%`,
                        background: "rgba(167, 139, 250, 0.4)",
                        transitionDelay: `${j * 50}ms`,
                      }}
                    />
                  ))}
                  {agentCount > 7 && <span className="text-[9px] text-muted-foreground/30 ml-1 font-bold">+{agentCount - 7}</span>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="relative text-[12px] text-muted-foreground/40">No repos configured</p>
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
  const barVisible = useStagger(30, 20)

  return (
    <div className="relative">
      {/* Glow line behind bars */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

      <div className="flex items-end gap-[3px] h-28">
        {days.map((d, i) => {
          const h = d.count > 0 ? Math.max((d.count / max) * 100, 12) : 0
          const isHovered = hoveredIdx === i
          return (
            <div
              key={d.date}
              className="flex-1 relative"
              style={{ height: "100%" }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                className="absolute bottom-0 w-full rounded-t transition-all ease-out cursor-default"
                style={{
                  height: barVisible[i]
                    ? d.count > 0 ? `${h}%` : "2px"
                    : "0px",
                  transitionDuration: `${500 + i * 20}ms`,
                  background: d.count > 0
                    ? isHovered
                      ? "linear-gradient(to top, rgba(96, 165, 250, 0.9), rgba(139, 92, 246, 0.7))"
                      : "linear-gradient(to top, rgba(96, 165, 250, 0.5), rgba(96, 165, 250, 0.2))"
                    : "rgba(255,255,255,0.03)",
                  boxShadow: isHovered && d.count > 0 ? "0 0 16px rgba(96, 165, 250, 0.4)" : "none",
                  transform: isHovered && d.count > 0 ? "scaleX(1.4) scaleY(1.05)" : "scaleX(1)",
                  transformOrigin: "bottom center",
                  borderRadius: "3px 3px 0 0",
                }}
              />
              {isHovered && d.count > 0 && (
                <div
                  className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover/90 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1 shadow-2xl whitespace-nowrap z-10"
                  style={{ animation: "homeSlotSpin 200ms ease-out" }}
                >
                  <span className="text-[11px] font-bold text-foreground">{d.count}</span>
                  <span className="text-[10px] text-muted-foreground/40 ml-1.5">{d.date.slice(5)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2.5">
        <span className="text-[9px] text-muted-foreground/25 font-medium">{days[0].date.slice(5)}</span>
        <span className="text-[9px] text-muted-foreground/25 font-medium">Today</span>
      </div>
    </div>
  )
}
