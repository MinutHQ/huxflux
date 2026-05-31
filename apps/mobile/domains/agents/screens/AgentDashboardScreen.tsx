import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgents, useRepos, api, getActiveServer, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { useState } from "react"
import { c } from "@/theme"
import { useHydrated } from "@/lib/hydration"
import { useStagger } from "../hooks/dashboardAnimations"
import { GlowOrbs, FloatingParticles } from "../components/dashboard/Background"
import { HeroCard } from "../components/dashboard/HeroCard"
import { TokenPanel } from "../components/dashboard/TokenPanel"
import { CodePanel } from "../components/dashboard/CodePanel"
import { ActivityChart } from "../components/dashboard/ActivityChart"
import { StatusPanel } from "../components/dashboard/StatusPanel"
import { RepoPanel } from "../components/dashboard/RepoPanel"

export function AgentDashboardScreen() {
  const insets = useSafeAreaInsets()
  const hydrated = useHydrated()
  const server = getActiveServer()
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const [refreshing, setRefreshing] = useState(false)

  const { data: stats, isLoading, refetch } = useHuxfluxQuery({
    queryKey: queryKeys.agents.stats(server?.url),
    queryFn: () => api.agents.stats(),
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

  // `c.accent` is not defined in theme.ts (pre-existing bug) — resolves to undefined at runtime,
  // which Ionicons/ActivityIndicator treat as the platform default color. Preserved verbatim from source.
  const accent: string | undefined = (c as Record<string, string>).accent

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
          <ActivityIndicator color={accent} />
        </View>
      ) : !server ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>Connect a server to see stats</Text>
        </View>
      ) : !stats ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Background effects */}
          <GlowOrbs />
          <FloatingParticles />

          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
            contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10 }}
          >
            {/* Hero stat cards */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeroCard iconName="git-branch-outline" target={stats.agents.total} label="Worktrees" color="#a78bfa" bgTint="#a78bfa" anim={heroAnims[0]} />
              <HeroCard iconName="folder-outline" target={stats.repos} label="Repos" color="#34d399" bgTint="#34d399" anim={heroAnims[1]} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeroCard iconName="chatbubble-outline" target={stats.messages.total} label="Messages" color="#60a5fa" bgTint="#60a5fa" anim={heroAnims[2]} />
              <HeroCard iconName="construct-outline" target={stats.toolCalls} label="Tool Calls" color="#fbbf24" bgTint="#fbbf24" anim={heroAnims[3]} />
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
