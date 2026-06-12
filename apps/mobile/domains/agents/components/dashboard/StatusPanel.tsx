import { View, Text, Animated } from "react-native"
import { statusConfig, type AgentSummary, type AgentStatus } from "@huxflux/shared"
import { c, statusColors } from "@/theme"
import { useStagger } from "../../hooks/dashboardAnimations"
import { AnimatedBar } from "./AnimatedBar"

const SIDEBAR_STATUS_ORDER: AgentStatus[] = ["done", "in-review", "draft-pr", "in-progress", "backlog", "cancelled"]

export function StatusPanel({ agents }: { agents: AgentSummary[] }) {
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
