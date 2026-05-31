import { useRef, useEffect, useState } from "react"
import { Animated, Easing } from "react-native"

export function useAnimatedNumber(target: number, duration = 1600) {
  const anim = useRef(new Animated.Value(0)).current
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    anim.setValue(0)
    setDisplay(0)
    const listener = anim.addListener(({ value }) => {
      setDisplay(Math.round(value))
    })
    Animated.timing(anim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.poly(5)),
      useNativeDriver: false,
    }).start()
    return () => anim.removeListener(listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return display
}

export function useStagger(count: number, delayMs = 80) {
  const anims = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current
  useEffect(() => {
    const animations = anims.map((a, i) =>
      Animated.timing(a, { toValue: 1, duration: 600, delay: i * delayMs, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    )
    Animated.parallel(animations).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return anims
}

export function useBarFill(targetWidth: number, delay = 0, duration = 1200) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, {
      toValue: targetWidth,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWidth])
  return anim
}

export function usePulse(duration = 2500) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return anim
}
