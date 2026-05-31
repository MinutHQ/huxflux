import { useEffect, useRef, useState } from "react"

/**
 * Tracks elapsed seconds since the most recent transition into streaming.
 * Resets to 0 every time streaming starts; freezes when it stops.
 */
export function useStreamingElapsed(uiIsStreaming: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const streamingStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (uiIsStreaming) {
      if (streamingStartRef.current === null) {
        streamingStartRef.current = Date.now()
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset timer when a new streaming session starts
        setElapsedSeconds(0)
      }
      const id = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - streamingStartRef.current!) / 1000))
      }, 1000)
      return () => clearInterval(id)
    }
    streamingStartRef.current = null
    setElapsedSeconds(0)
  }, [uiIsStreaming])

  return elapsedSeconds
}
