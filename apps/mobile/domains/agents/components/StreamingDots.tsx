import { View, Animated, Easing } from "react-native"
import { useRef, useEffect } from "react"

export function StreamingDots() {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current

  useEffect(() => {
    const animations = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(a, { toValue: 1, duration: 400, delay: i * 150, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(a, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    )
    Animated.parallel(animations).start()
    return () => anims.forEach((a) => a.stopAnimation())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: "#f59e0b",
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          }}
        />
      ))}
    </View>
  )
}
