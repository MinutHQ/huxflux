import { useCallback, useState } from "react"
import type { DeletingAgent } from "./types"

/**
 * Owns the "agent being deleted" lifecycle slice. The teardown route reads
 * `deletingAgent` to render its animation; `justDeleted` blocks automatic
 * agent-selection for one tick so the deletion animation isn't interrupted
 * by the workspace picking a fallback agent.
 */
export function useDeletingAgent() {
  const [deletingAgent, setDeletingAgent] = useState<DeletingAgent | null>(null)
  const [justDeleted, setJustDeleted] = useState(false)

  const startDeleting = useCallback((info: DeletingAgent) => {
    setDeletingAgent(info)
    setJustDeleted(true)
  }, [])

  const clearDeleting = useCallback(() => {
    setDeletingAgent(null)
  }, [])

  return {
    deletingAgent,
    justDeleted,
    setJustDeleted,
    startDeleting,
    clearDeleting,
  }
}
