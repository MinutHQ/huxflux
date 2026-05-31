import { useCallback, useState } from "react"
import type { PendingAgent } from "./types"

/**
 * Owns the "agent being created" lifecycle slice. The setup route reads
 * `pendingAgent` to render its progress UI, and the chat view reads
 * `queuedSetupMessage` so the first message typed during setup is delivered
 * once the new agent is ready.
 */
export function usePendingAgent() {
  const [pendingAgent, setPendingAgent] = useState<PendingAgent | null>(null)
  const [queuedSetupMessage, setQueuedSetupMessage] = useState<string | null>(null)

  const startPending = useCallback((info: PendingAgent) => {
    setPendingAgent(info)
    setQueuedSetupMessage(null)
  }, [])

  const clearPending = useCallback(() => {
    setPendingAgent(null)
    setQueuedSetupMessage(null)
  }, [])

  return {
    pendingAgent,
    queuedSetupMessage,
    setQueuedSetupMessage,
    startPending,
    clearPending,
    setPendingAgent,
  }
}
