import { View, Animated } from "react-native"
import { c } from "@/theme"
import { useBarFill } from "../../hooks/dashboardAnimations"

export function AnimatedBar({ percent, color, delay = 0 }: { percent: number; color: string; delay?: number }) {
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
