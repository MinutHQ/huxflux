import { useCallback, useState } from "react"
import { STORAGE_KEYS } from "../config"

function keyFor(repoId: string | undefined, prNumber: number): string | null {
  return repoId ? `${STORAGE_KEYS.viewedPrefix}:${repoId}:${prNumber}` : null
}

/** Returns the persisted "viewed files" set for a PR, plus mutators. */
export function useViewedFiles(repoId: string | undefined, prNumber: number) {
  const storageKey = keyFor(repoId, prNumber)
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(() => {
    if (!storageKey) return new Set()
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  const persist = useCallback(
    (next: Set<string>) => {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
    },
    [storageKey],
  )

  const toggleViewed = useCallback(
    (path: string) => {
      setViewedFiles((prev) => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setAll = useCallback(
    (next: Set<string>) => {
      setViewedFiles(next)
      persist(next)
    },
    [persist],
  )

  return { viewedFiles, toggleViewed, setAll }
}
