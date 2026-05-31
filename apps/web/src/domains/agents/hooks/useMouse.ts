import { useEffect, useState } from "react"

/** Tracks the current window mouse position. Passive listener, cleans up on unmount. */
export function useMouse(): { x: number; y: number } {
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", handler, { passive: true })
    return () => window.removeEventListener("mousemove", handler)
  }, [])

  return pos
}
