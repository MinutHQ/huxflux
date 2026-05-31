import { useRef, useState, useEffect, useMemo } from "react"
import { Animated, Easing } from "react-native"
import { SETUP_STEPS, PARTICLE_COUNT } from "./setupSteps"
import type { SetupParticle } from "./SetupParticles"

function makeRingAnim(scale: Animated.Value, opacity: Animated.Value, startOpacity: number, delay: number) {
  const run = () => {
    scale.setValue(0.8)
    opacity.setValue(startOpacity)
    Animated.parallel([
      Animated.timing(scale, { toValue: 2.5, duration: 2500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 2500, useNativeDriver: true }),
    ]).start(() => run())
  }
  if (delay > 0) setTimeout(run, delay)
  else run()
}

interface BootRefs {
  fadeIn: Animated.Value
  float: Animated.Value
  ring1Scale: Animated.Value
  ring1Opacity: Animated.Value
  ring2Scale: Animated.Value
  ring2Opacity: Animated.Value
  ring3Scale: Animated.Value
  ring3Opacity: Animated.Value
  orbit: Animated.Value
  orbit2: Animated.Value
  particleAnims: Animated.Value[]
  particles: SetupParticle[]
}

function startBootAnimations(r: BootRefs) {
  Animated.timing(r.fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start()
  Animated.loop(
    Animated.sequence([
      Animated.timing(r.float, { toValue: -8, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(r.float, { toValue: 0, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])
  ).start()
  makeRingAnim(r.ring1Scale, r.ring1Opacity, 0.5, 0)
  makeRingAnim(r.ring2Scale, r.ring2Opacity, 0.35, 800)
  makeRingAnim(r.ring3Scale, r.ring3Opacity, 0.2, 1600)
  Animated.loop(Animated.timing(r.orbit, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })).start()
  Animated.loop(Animated.timing(r.orbit2, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true })).start()

  r.particleAnims.forEach((anim, i) => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(r.particles[i].delay),
        Animated.timing(anim, { toValue: 1, duration: r.particles[i].duration / 2, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: r.particles[i].duration / 2, useNativeDriver: true }),
      ])
    ).start()
  })
}

function buildParticles(): SetupParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: `${(i * 41 + 17) % 100}%` as `${number}%`,
    y: `${(i * 59 + 11) % 100}%` as `${number}%`,
    size: 2 + (i % 3),
    duration: 2500 + (i % 4) * 1100,
    delay: (i % 8) * 350,
    baseOpacity: 0.1 + (i % 4) * 0.08,
    color: i % 3 === 0 ? "rgba(251,191,36,1)" : i % 3 === 1 ? "rgba(96,165,250,1)" : "rgba(167,139,250,1)",
  }))
}

/**
 * Drives the new-agent setup overlay animations. Returns the full bundle
 * of Animated values, derived rotations, and step/progress state needed
 * by SetupOverlay.
 */
export function useSetupAnimations(creatingName: string) {
  const float = useRef(new Animated.Value(0)).current
  const ring1Scale = useRef(new Animated.Value(0.8)).current
  const ring1Opacity = useRef(new Animated.Value(0.5)).current
  const ring2Scale = useRef(new Animated.Value(0.8)).current
  const ring2Opacity = useRef(new Animated.Value(0.35)).current
  const ring3Scale = useRef(new Animated.Value(0.8)).current
  const ring3Opacity = useRef(new Animated.Value(0.2)).current
  const orbit = useRef(new Animated.Value(0)).current
  const orbit2 = useRef(new Animated.Value(0)).current
  const fadeIn = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  const particleAnims = useRef(Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0))).current

  const [visibleSteps, setVisibleSteps] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [typedTitle, setTypedTitle] = useState("")

  const particles = useMemo(buildParticles, [])

  useEffect(() => {
    startBootAnimations({ fadeIn, float, ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, ring3Scale, ring3Opacity, orbit, orbit2, particleAnims, particles })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Typewriter effect
  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      if (i <= creatingName.length) {
        setTypedTitle(creatingName.slice(0, i))
        i++
      } else {
        clearInterval(timer)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [creatingName])

  // Step progression over ~3s
  useEffect(() => {
    const budget = 3000 * 0.9
    const stepTime = budget / SETUP_STEPS.length
    const timers: ReturnType<typeof setTimeout>[] = []
    SETUP_STEPS.forEach((_, i) => {
      const showAt = 300 + i * stepTime
      const doneAt = showAt + stepTime * 0.65
      timers.push(setTimeout(() => setVisibleSteps((v) => v + 1), showAt))
      if (i < SETUP_STEPS.length - 1) {
        timers.push(setTimeout(() => setCompletedSteps((v) => v + 1), doneAt))
      }
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  // Progress bar
  useEffect(() => {
    const prog = Math.min(((completedSteps + 0.5) / SETUP_STEPS.length) * 100, 95)
    Animated.timing(progressAnim, { toValue: prog, duration: 600, useNativeDriver: false }).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSteps])

  const orbitRotate = orbit.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  const orbit2Rotate = orbit2.interpolate({ inputRange: [0, 1], outputRange: ["120deg", "480deg"] })

  return {
    float,
    ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, ring3Scale, ring3Opacity,
    orbitRotate, orbit2Rotate,
    fadeIn, progressAnim,
    particles, particleAnims,
    visibleSteps, completedSteps, typedTitle,
  }
}
