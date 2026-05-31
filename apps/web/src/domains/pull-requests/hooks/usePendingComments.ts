import { useCallback, useState } from "react"
import { STORAGE_KEYS } from "../config"
import type { PendingReviewComment } from "../pull-requests.types"

function keyFor(repoId: string | undefined, prNumber: number): string | null {
  return repoId ? `${STORAGE_KEYS.pendingPrefix}:${repoId}:${prNumber}` : null
}

/**
 * Locally-staged review comments for a single PR. Persisted to localStorage
 * so the user can compose comments across reloads before submitting a review.
 */
export function usePendingComments(repoId: string | undefined, prNumber: number) {
  const storageKey = keyFor(repoId, prNumber)
  const [pendingComments, setPendingComments] = useState<PendingReviewComment[]>(() => {
    if (!storageKey) return []
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as PendingReviewComment[]) : []
    } catch {
      return []
    }
  })

  const savePendingComments = useCallback(
    (
      updater:
        | PendingReviewComment[]
        | ((prev: PendingReviewComment[]) => PendingReviewComment[]),
    ) => {
      setPendingComments((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next))
        return next
      })
    },
    [storageKey],
  )

  return { pendingComments, savePendingComments }
}
