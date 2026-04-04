import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Animated, Easing, Dimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgents, useRepos, statusConfig, api, type AgentSummary, type AgentStatus, type WorkspaceStats, type Repo, getActiveServer } from "@huxflux/shared"
import { useQuery } from "@tanstack/react-query"
import { useState, useEffect, useRef, useMemo } from "react"
import { c, statusColors } from "../../theme"
import { useHydrated } from "../_layout"

const SIDEBAR_STATUS_ORDER: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]
const { width: SCREEN_W } = Dimensions.get("window")

// ── Animation hooks ──────────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 1600) {
  const anim = useRef(new Animated.Value(0)).current
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    anim.setValue(0)
    setDisplay(0)
    const listener = anim.addListener(({ value }) => {
      setDisplay(Math.round(value))
    })
    Animated.timing(anim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.poly(5)),
      useNativeDriver: false,
    }).start()
    return () => anim.removeListener(listener)
  }, [target])

  return display
}

function useStagger(count: number, delayMs = 80) {
  const anims = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current
  useEffect(() => {
    const animations = anims.map((a, i) =>
      Animated.timing(a, { toValue: 1, duration: 600, delay: i * delayMs, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    )
    Animated.parallel(animations).start()
  }, [])
  return anims
}

function useBarFill(targetWidth: number, delay = 0, duration = 1200) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, {
      toValue: targetWidth,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [targetWidth])
  return anim
}

function usePulse(duration = 2500) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return anim
}

// ── Floating particles ───────────────────────────────────────────────────────

type Particle = { x: number; y: number; size: number; dur: number; delay: number; hue: number }

function FloatingParticles() {
  const particles = useMemo<Particle[]>(() =>
    Array.from({ length: 30 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1.5 + Math.random() * 3,
      dur: 10000 + Math.random() * 18000,
      delay: -Math.random() * 20000,
      hue: 200 + Math.random() * 80,
    })), [])

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }} pointerEvents="none">
      {particles.map((p, i) => (
        <ParticleDot key={i} p={p} />
      ))}
    </View>
  )
}

function ParticleDot({ p }: { p: Particle }) {
  const translateY = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const startDelay = Math.abs(p.delay)
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(translateY, { toValue: -30, duration: p.dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true, delay: startDelay % 2000 }),
          Animated.timing(opacity, { toValue: 0.7, duration: p.dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(translateY, { toValue: 0, duration: p.dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: p.dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    ).start()
  }, [])

  const color = `hsla(${p.hue}, 70%, 60%, 1)`
  return (
    <Animated.View style={{
      position: "absolute",
      left: `${p.x}%`, top: `${p.y}%`,
      width: p.size, height: p.size, borderRadius: p.size / 2,
      backgroundColor: color,
      opacity,
      transform: [{ translateY }],
      shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: p.size * 4,
    }} />
  )
}

// ── Glow orbs (ambient background blobs) ─────────────────────────────────────

function GlowOrbs() {
  const pulse1 = usePulse(8000)
  const pulse2 = usePulse(10000)
  const pulse3 = usePulse(12000)

  const orbs = [
    { color: "rgba(59, 130, 246, 0.06)", size: 250, top: -40, left: -60, pulse: pulse1 },
    { color: "rgba(139, 92, 246, 0.05)", size: 200, top: 120, right: -50, pulse: pulse2 },
    { color: "rgba(16, 185, 129, 0.04)", size: 220, top: 350, left: -30, pulse: pulse3 },
  ]

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {orbs.map((orb, i) => (
        <Animated.View key={i} style={{
          position: "absolute", width: orb.size, height: orb.size, borderRadius: orb.size / 2,
          backgroundColor: orb.color,
          top: orb.top, left: orb.left, right: (orb as any).right,
          opacity: pulse1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
          transform: [{ scale: orb.pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
        }} />
      ))}
    </View>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ── Hero stat card (animated) ────────────────────────────────────────────────

function HeroCard({ icon, target, label, color, bgTint, anim }: {
  icon: string; target: number; label: string; color: string; bgTint: string; anim: Animated.Value
}) {
  const display = useAnimatedNumber(target)
  const glowPulse = usePulse(3000)

  return (
    <Animated.View style={{
      flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14,
      padding: 12, overflow: "hidden",
      opacity: anim,
      transform: [
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
      ],
    }}>
      {/* Glow orb */}
      <Animated.View style={{
        position: "absolute", top: -12, right: -12, width: 50, height: 50, borderRadius: 25,
        backgroundColor: bgTint,
        opacity: glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.2] }),
        transform: [{ scale: glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
      }} />
      {/* Shimmer stripe */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        opacity: 0.03,
        backgroundColor: "transparent",
        borderRadius: 14,
      }}>
        <View style={{ position: "absolute", top: 0, bottom: 0, width: "30%", left: "35%", backgroundColor: "#fff", opacity: 0.3 }} />
      </View>

      <Text style={{ fontSize: 16, marginBottom: 6 }}>{icon}</Text>
      <Text style={{ color, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, fontFamily: "monospace" }}>
        {formatNum(display)}
      </Text>
      <Text style={{ color: c.fgSub, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 }}>{label}</Text>
    </Animated.View>
  )
}

// ── Animated bar ─────────────────────────────────────────────────────────────

function AnimatedBar({ percent, color, delay = 0 }: { percent: number; color: string; delay?: number }) {
  const width = useBarFill(percent, delay)
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.secondary, overflow: "hidden" }}>
      <Animated.View style={{
        height: 6, borderRadius: 3, backgroundColor: color,
        width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
        shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4,
      }} />
    </View>
  )
}

// ── Activity chart (animated bars) ───────────────────────────────────────────

function ActivityChart({ dailyAgents }: { dailyAgents: { date: string; count: number }[] }) {
  const data = dailyAgents.slice(-30)
  const max = Math.max(...data.map((d) => d.count), 1)
  const barAnims = useStagger(data.length, 20)

  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ color: c.fgSub, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Agent Activity (30 days)
        </Text>
        <Text style={{ color: c.fgSub, fontSize: 10 }}>{data.reduce((s, d) => s + d.count, 0)} total</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 80, gap: 2 }}>
        {data.map((d, i) => {
          const h = Math.max((d.count / max) * 70, d.count > 0 ? 4 : 0)
          return (
            <Animated.View key={d.date} style={{
              flex: 1, borderRadius: 2, backgroundColor: "#60a5fa",
              height: h,
              opacity: barAnims[i] ?? 0,
              transform: [{ scaleY: barAnims[i]?.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) ?? 0 }],
              shadowColor: "#60a5fa", shadowOffset: { width: 0, height: 0 },
              shadowOpacity: d.count > 0 ? 0.4 : 0, shadowRadius: 3,
            }} />
          )
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ color: c.placeholder, fontSize: 9 }}>{data[0]?.date.slice(5) ?? ""}</Text>
        <Text style={{ color: c.placeholder, fontSize: 9 }}>Today</Text>
      </View>
    </View>
  )
}

// ── Token panel (animated rows + bars) ───────────────────────────────────────

function TokenPanel({ stats }: { stats: WorkspaceStats }) {
  const totalTokens = stats.messages.inputTokens + stats.messages.outputTokens
  const rows = [
    { label: "Input", value: stats.messages.inputTokens, color: "#a78bfa" },
    { label: "Output", value: stats.messages.outputTokens, color: "#34d399" },
    { label: "Cache read", value: stats.messages.cacheReadTokens, color: "#60a5fa" },
    { label: "Cache write", value: stats.messages.cacheWriteTokens, color: "#fbbf24" },
  ]
  const rowAnims = useStagger(rows.length, 100)
  const max = Math.max(...rows.map((r) => r.value), 1)

  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ color: c.fgSub, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Token Usage</Text>
        <Text style={{ color: c.fgSub, fontSize: 10 }}>{formatNum(totalTokens)} total</Text>
      </View>
      {rows.map((row, i) => {
        const pct = (row.value / max) * 100
        return (
          <Animated.View key={row.label} style={{
            flexDirection: "row", alignItems: "center", paddingVertical: 5, gap: 8,
            opacity: rowAnims[i],
            transform: [{ translateX: rowAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: row.color }} />
            <Text style={{ color: c.fgSub, fontSize: 11, width: 70 }}>{row.label}</Text>
            <AnimatedBar percent={pct} color={row.color} delay={i * 150} />
            <Text style={{ color: c.fg, fontSize: 11, fontWeight: "600", fontFamily: "monospace", width: 48, textAlign: "right" }}>
              {formatNum(row.value)}
            </Text>
          </Animated.View>
        )
      })}
    </View>
  )
}

// ── Code changes panel (animated) ────────────────────────────────────────────

function CodePanel({ stats }: { stats: WorkspaceStats }) {
  const total = stats.fileChanges.additions + stats.fileChanges.deletions
  const addPct = total > 0 ? (stats.fileChanges.additions / total) * 100 : 0
  const delPct = total > 0 ? (stats.fileChanges.deletions / total) * 100 : 0
  const filesCount = useAnimatedNumber(stats.fileChanges.total, 1200)
  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 800, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: c.fgSub, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Code Changes</Text>
      <Text style={{ color: c.fg, fontSize: 32, fontWeight: "800", letterSpacing: -1, fontFamily: "monospace" }}>{filesCount}</Text>
      <Text style={{ color: c.fgSub, fontSize: 11, marginBottom: 10 }}>files changed</Text>
      <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 8 }}>
          <Text style={{ color: "#34d399", fontSize: 13, fontWeight: "700" }}>↗ {formatNum(stats.fileChanges.additions)}</Text>
          <Text style={{ color: "#f87171", fontSize: 13, fontWeight: "700" }}>↘ {formatNum(stats.fileChanges.deletions)}</Text>
        </View>
        {total > 0 && (
          <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
            <AnimatedBar percent={addPct} color="#34d399" delay={300} />
            <AnimatedBar percent={delPct} color="#f87171" delay={500} />
          </View>
        )}
      </Animated.View>
    </View>
  )
}

// ── Status panel (animated rows + progress bars) ─────────────────────────────

function StatusPanel({ agents }: { agents: AgentSummary[] }) {
  const total = agents.length || 1
  const rowAnims = useStagger(SIDEBAR_STATUS_ORDER.length, 120)

  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: c.fgSub, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>By Status</Text>
      {/* Stacked bar */}
      {agents.length > 0 && (
        <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 10, gap: 1 }}>
          {SIDEBAR_STATUS_ORDER.map((s) => {
            const count = agents.filter((a) => a.status === s).length
            if (count === 0) return null
            return <AnimatedBar key={s} percent={(count / total) * 100} color={statusColors[s]?.color ?? c.fgSub} delay={SIDEBAR_STATUS_ORDER.indexOf(s) * 100} />
          })}
        </View>
      )}
      {SIDEBAR_STATUS_ORDER.map((s, i) => {
        const count = agents.filter((a) => a.status === s).length
        const sc = statusColors[s]
        const color = sc?.color ?? c.fgSub
        return (
          <Animated.View key={s} style={{
            flexDirection: "row", alignItems: "center", paddingVertical: 4,
            opacity: rowAnims[i],
            transform: [{ translateX: rowAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, marginRight: 8 }} />
            <Text style={{ color, fontSize: 12, flex: 1 }}>{statusConfig[s].label}</Text>
            {count > 0 ? (
              <View style={{ backgroundColor: sc?.bg ?? c.secondary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, minWidth: 22, alignItems: "center" }}>
                <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{count}</Text>
              </View>
            ) : (
              <Text style={{ color: c.placeholder, fontSize: 12 }}>0</Text>
            )}
          </Animated.View>
        )
      })}
    </View>
  )
}

// ── Repo panel (animated) ────────────────────────────────────────────────────

function RepoPanel({ repos, agents }: { repos: Repo[]; agents: AgentSummary[] }) {
  const rowAnims = useStagger(repos.length, 100)

  if (repos.length === 0) return null
  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: c.fgSub, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Repositories</Text>
      {repos.map((repo, i) => {
        const count = agents.filter((a) => a.repoId === repo.id).length
        return (
          <Animated.View key={repo.id} style={{
            flexDirection: "row", alignItems: "center", paddingVertical: 7, gap: 10,
            opacity: rowAnims[i] ?? 1,
            transform: [
              { translateY: (rowAnims[i] ?? new Animated.Value(1)).interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              { scale: (rowAnims[i] ?? new Animated.Value(1)).interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
            ],
          }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: "600" }}>⟨/⟩</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.fg, fontSize: 13, fontWeight: "600" }}>{repo.name}</Text>
              <Text style={{ color: c.fgSub, fontSize: 11 }}>{count} agent{count !== 1 ? "s" : ""}</Text>
            </View>
          </Animated.View>
        )
      })}
    </View>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const insets = useSafeAreaInsets()
  const hydrated = useHydrated()
  const server = getActiveServer()
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const [refreshing, setRefreshing] = useState(false)

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["stats", server?.url],
    queryFn: () => api.getStats(),
    enabled: hydrated && !!server,
    staleTime: 60_000,
  })

  // Stagger the 4 hero cards
  const heroAnims = useStagger(4, 140)

  async function onRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 10, paddingBottom: 12, paddingHorizontal: 16,
        backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border,
        zIndex: 10,
      }}>
        <Text style={{ color: c.fg, fontSize: 20, fontWeight: "800", letterSpacing: -0.5 }}>Huxflux</Text>
        <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>Lifetime workspace stats</Text>
      </View>

      {!hydrated || isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : !server ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>Connect a server to see stats</Text>
        </View>
      ) : !stats ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Background effects */}
          <GlowOrbs />
          <FloatingParticles />

          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
            contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10 }}
          >
            {/* Hero stat cards */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeroCard icon="⚡" target={stats.agents.total} label="Worktrees" color="#a78bfa" bgTint="#a78bfa" anim={heroAnims[0]} />
              <HeroCard icon="📦" target={stats.repos} label="Repos" color="#34d399" bgTint="#34d399" anim={heroAnims[1]} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeroCard icon="💬" target={stats.messages.total} label="Messages" color="#60a5fa" bgTint="#60a5fa" anim={heroAnims[2]} />
              <HeroCard icon="⚙" target={stats.toolCalls} label="Tool Calls" color="#fbbf24" bgTint="#fbbf24" anim={heroAnims[3]} />
            </View>

            {/* Token + Code side by side */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TokenPanel stats={stats} />
              <CodePanel stats={stats} />
            </View>

            {/* Activity chart */}
            {stats.dailyAgents.length > 0 && (
              <ActivityChart dailyAgents={stats.dailyAgents} />
            )}

            {/* Status + Repos */}
            <StatusPanel agents={agents} />
            <RepoPanel repos={repos} agents={agents} />
          </ScrollView>
        </View>
      )}
    </View>
  )
}
