import { useEffect, useRef, useState } from "react"

/**
 * Animates a numeric value from its current displayed value to `target` over
 * `duration` ms using a 5th-power ease-out (spring-like) curve.
 *
 * Returns the currently animated integer. When `target` changes mid-animation
 * we re-start from the value we're currently displaying (captured into a ref),
 * not from the latest `target` — that's the intentional reason `value` is
 * deliberately excluded from the effect deps.
 */
export function useAnimatedNumber(target: number, duration = 1600): number {
  const [value, setValue] = useState(0)
  const ref = useRef({ start: 0, startTime: 0, raf: 0 })

  useEffect(() => {
    const r = ref.current
    r.start = value
    r.startTime = performance.now()
    const tick = (now: number) => {
      const elapsed = now - r.startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 5)
      setValue(Math.round(r.start + (target - r.start) * eased))
      if (progress < 1) r.raf = requestAnimationFrame(tick)
    }
    r.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(r.raf)
    // `value` is deliberately excluded: it's captured as the start point of
    // the next animation, NOT a trigger. Including it would re-run on every
    // tick and restart the animation forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}
