import { View, Text, Animated } from "react-native"
import type { WorkspaceStats } from "@huxflux/shared"
import { c } from "@/theme"
import { useStagger } from "../../hooks/dashboardAnimations"
import { formatNum } from "../../utils"
import { AnimatedBar } from "./AnimatedBar"

export function TokenPanel({ stats }: { stats: WorkspaceStats }) {
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
