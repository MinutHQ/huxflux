import { useCallback, useState } from "react"
import type { PRThread } from "@huxflux/shared"

function initialCollapsed(threads: PRThread[] | undefined): Set<string> {
  const initial = new Set<string>()
  for (const t of threads ?? []) {
    if (t.isResolved) initial.add(t.id)
  }
  return initial
}

/**
 * Tracks the collapsed ids inside the inline-comment overlay. Resolved
 * threads start collapsed; everything else expands by default.
 */
export function useCollapsedSet(threads: PRThread[] | undefined) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => initialCollapsed(threads))

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return { collapsed, toggle }
}
