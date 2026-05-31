import { Animated } from "react-native"

export interface SetupParticle {
  id: number
  x: `${number}%`
  y: `${number}%`
  size: number
  duration: number
  delay: number
  baseOpacity: number
  color: string
}

export function SetupParticles({ particles, particleAnims }: {
  particles: SetupParticle[]
  particleAnims: Animated.Value[]
}) {
  return (
    <>
      {particles.map((p, i) => (
        <Animated.View
          key={p.id}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            opacity: particleAnims[i].interpolate({
              inputRange: [0, 1],
              outputRange: [p.baseOpacity, Math.min(p.baseOpacity * 2.5, 0.6)],
            }),
          }}
        />
      ))}
    </>
  )
}
