import { useEffect, useState } from "react"

/**
 * Tracks elapsed seconds since streaming started. When an `anchorIso`
 * timestamp is provided (e.g. the last assistant message's timestamp),
 * the timer survives component remounts (navigating away and back).
 * Falls back to `Date.now()` when no anchor is available.
 */
export function useStreamingElapsed(uiIsStreaming: boolean, anchorIso?: string | null) {
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (!uiIsStreaming) return 0
    if (anchorIso) return Math.max(0, Math.floor((Date.now() - new Date(anchorIso).getTime()) / 1000))
    return 0
  })

  useEffect(() => {
    if (!uiIsStreaming) {
      setElapsedSeconds(0)
      return
    }
    const start = anchorIso ? new Date(anchorIso).getTime() : Date.now()
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    const id = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [uiIsStreaming, anchorIso])

  return elapsedSeconds
}
