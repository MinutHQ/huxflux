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
 *   - `setupInputFocused`: whether the setup textarea held focus. It is not
 *     cleared when the textarea unmounts (no blur fires), so on the route flip
 *     ChatView knows to move focus into the new agent's composer.
 */
export function usePendingAgent() {
  const [pendingAgent, setPendingAgent] = useState<PendingAgent | null>(null)
  const [queuedSetupMessage, setQueuedSetupMessage] = useState<string | null>(null)
  const [setupDraft, setSetupDraft] = useState<string>("")
  const [setupInputFocused, setSetupInputFocused] = useState(false)

  const startPending = useCallback((info: PendingAgent) => {
    setPendingAgent(info)
    setQueuedSetupMessage(null)
    setSetupDraft("")
    setSetupInputFocused(false)
  }, [])

  const clearPending = useCallback(() => {
    setPendingAgent(null)
    setQueuedSetupMessage(null)
    setSetupDraft("")
    setSetupInputFocused(false)
  }, [])

  return {
    pendingAgent,
    queuedSetupMessage,
    setQueuedSetupMessage,
    setupDraft,
    setSetupDraft,
    setupInputFocused,
    setSetupInputFocused,
    startPending,
    clearPending,
    setPendingAgent,
  }
}
