import { View, Text, Animated } from "react-native"
import { c } from "@/theme"
import { useStagger } from "../../hooks/dashboardAnimations"

export function ActivityChart({ dailyAgents }: { dailyAgents: { date: string; count: number }[] }) {
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
