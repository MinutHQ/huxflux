import { View, Text, Animated } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { AgentSummary, Repo } from "@huxflux/shared"
import { c } from "@/theme"
import { useStagger } from "../../hooks/dashboardAnimations"

export function RepoPanel({ repos, agents }: { repos: Repo[]; agents: AgentSummary[] }) {
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
              {/* `c.accent` is not defined in theme.ts (pre-existing bug) — preserved verbatim from source. */}
              <Ionicons name="code-slash-outline" size={14} color={(c as Record<string, string>).accent} />
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
