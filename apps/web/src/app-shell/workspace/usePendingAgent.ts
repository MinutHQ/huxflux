import { useCallback, useState } from "react"
import type { PendingAgent } from "./types"

/**
 * Owns the "agent being created" lifecycle slice. The setup route reads
 * `pendingAgent` to render its progress UI. Two pieces of cross-route state
 * survive the route flip from `/agent/setup` to `/agent/$agentId`:
 *   - `queuedSetupMessage`: the user explicitly submitted (Enter / send button)
 *     while waiting; ChatView auto-sends it on mount.
 *   - `setupDraft`: per-keystroke mirror of the setup textarea. If the create
 *     resolves while the user is mid-typing, this lands in the new agent's
 *     chat input so nothing is lost.
 */
export function usePendingAgent() {
  const [pendingAgent, setPendingAgent] = useState<PendingAgent | null>(null)
  const [queuedSetupMessage, setQueuedSetupMessage] = useState<string | null>(null)
  const [setupDraft, setSetupDraft] = useState<string>("")

  const startPending = useCallback((info: PendingAgent) => {
    setPendingAgent(info)
    setQueuedSetupMessage(null)
    setSetupDraft("")
  }, [])

  const clearPending = useCallback(() => {
    setPendingAgent(null)
    setQueuedSetupMessage(null)
    setSetupDraft("")
  }, [])

  return {
    pendingAgent,
    queuedSetupMessage,
    setQueuedSetupMessage,
    setupDraft,
    setSetupDraft,
    startPending,
    clearPending,
    setPendingAgent,
  }
}
