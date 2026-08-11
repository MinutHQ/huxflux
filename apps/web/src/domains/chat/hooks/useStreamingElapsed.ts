import { useEffect, useState } from "react"

export function useStreamingElapsed(uiIsStreaming: boolean, anchorIso?: string | null) {
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (!uiIsStreaming) return 0
    if (anchorIso) return Math.max(0, Math.floor((Date.now() - new Date(anchorIso).getTime()) / 1000))
    return 0
  })

  useEffect(() => {
    if (!uiIsStreaming) return
    const start = anchorIso ? new Date(anchorIso).getTime() : Date.now()
    const tick = () => Math.max(0, Math.floor((Date.now() - start) / 1000))
    const rafId = requestAnimationFrame(() => setElapsedSeconds(tick()))
    const id = setInterval(() => setElapsedSeconds(tick()), 1000)
    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(id)
    }
  }, [uiIsStreaming, anchorIso])

  return uiIsStreaming ? elapsedSeconds : 0
}
