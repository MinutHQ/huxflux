import { View, Text, Animated, Easing } from "react-native"
import { useRef, useEffect } from "react"
import type { WorkspaceStats } from "@huxflux/shared"
import { c } from "@/theme"
import { useAnimatedNumber } from "../../hooks/dashboardAnimations"
import { formatNum } from "../../utils"
import { AnimatedBar } from "./AnimatedBar"

export function CodePanel({ stats }: { stats: WorkspaceStats }) {
  const total = stats.fileChanges.additions + stats.fileChanges.deletions
  const addPct = total > 0 ? (stats.fileChanges.additions / total) * 100 : 0
  const delPct = total > 0 ? (stats.fileChanges.deletions / total) * 100 : 0
  const filesCount = useAnimatedNumber(stats.fileChanges.total, 1200)
  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 800, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
