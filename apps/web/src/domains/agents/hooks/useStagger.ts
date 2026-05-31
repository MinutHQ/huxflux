import { useEffect, useState } from "react"

/**
 * Returns a `count`-length array of booleans that flip from false → true one
 * by one, `delayMs` apart, starting on mount. Used by the home dashboard to
 * stagger card / bar reveal animations.
 */
export function useStagger(count: number, delayMs = 80): boolean[] {
  const [visible, setVisible] = useState<boolean[]>(() => Array(count).fill(false))

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < count; i++) {
      timers.push(
        setTimeout(() => {
          setVisible((prev) => {
            const next = [...prev]
            next[i] = true
            return next
          })
        }, i * delayMs),
      )
    }
    return () => timers.forEach(clearTimeout)
  }, [count, delayMs])

  return visible
}
