import { View, Animated, Easing } from "react-native"
import { useRef, useEffect, useState } from "react"
import { usePulse } from "../../hooks/dashboardAnimations"

// ── Floating particles ───────────────────────────────────────────────────────

type Particle = { x: number; y: number; size: number; dur: number; delay: number; hue: number }

function buildParticles(): Particle[] {
  return Array.from({ length: 30 }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1.5 + Math.random() * 3,
    dur: 10000 + Math.random() * 18000,
    delay: -Math.random() * 20000,
    hue: 200 + Math.random() * 80,
  }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

export function FloatingParticles() {
  // Particles are randomised once per mount. `useState` lazy initializer is the
  // canonical way to call an impure factory exactly once and keep render pure.
  const [particles] = useState(buildParticles)

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }} pointerEvents="none">
      {particles.map((p, i) => (
        <ParticleDot key={i} p={p} />
      ))}
    </View>
  )
}

// ── Glow orbs (ambient background blobs) ─────────────────────────────────────

export function GlowOrbs() {
  const pulse1 = usePulse(8000)
  const pulse2 = usePulse(10000)
  const pulse3 = usePulse(12000)

  type Orb = { color: string; size: number; top: number; left?: number; right?: number; pulse: Animated.Value }
  const orbs: Orb[] = [
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
          top: orb.top, left: orb.left, right: orb.right,
          opacity: pulse1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
          transform: [{ scale: orb.pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
        }} />
      ))}
    </View>
  )
}
