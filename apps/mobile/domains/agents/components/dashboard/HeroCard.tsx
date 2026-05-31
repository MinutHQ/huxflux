import { View, Text, Animated } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { c } from "@/theme"
import { useAnimatedNumber, usePulse } from "../../hooks/dashboardAnimations"
import { formatNum } from "../../utils"

export function HeroCard({ iconName, target, label, color, bgTint, anim }: {
  iconName: keyof typeof Ionicons.glyphMap
  target: number
  label: string
  color: string
  bgTint: string
  anim: Animated.Value
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

      <Ionicons name={iconName} size={16} color={color} style={{ marginBottom: 6 }} />
      <Text style={{ color, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, fontFamily: "monospace" }}>
        {formatNum(display)}
      </Text>
      <Text style={{ color: c.fgSub, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 }}>{label}</Text>
    </Animated.View>
  )
}
