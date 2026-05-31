import { useState, useEffect } from "react"
import { getStorage } from "@huxflux/shared"
import { COLLAPSED_SECTIONS_KEY, REPO_FILTER_KEY, GROUP_BY_KEY } from "@/lib/prefs"
import type { GroupBy } from "../agents.types"

/**
 * Hydrate + persist UI prefs (collapsed sections, repo filter, group-by mode)
 * for the agent-list screen. Skips persistence until `hydrated` is true so we
 * don't overwrite stored values during the initial render.
 */
export function useAgentListPrefs(hydrated: boolean) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["done", "cancelled"]))
  const [repoFilter, setRepoFilter] = useState<string>("all")
  const [groupBy, setGroupBy] = useState<GroupBy>("status")

  // Hydrate UI prefs from cache once storage is ready (keys pre-loaded by _layout.tsx).
  // setState-in-effect is intentional: storage is an external system, the hydration
  // step has to sync it into React state once after the cache is populated.
  useEffect(() => {
    if (!hydrated) return
    const storage = getStorage()
    const raw = storage.getItem(COLLAPSED_SECTIONS_KEY)
    if (raw != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      try { setCollapsed(new Set(JSON.parse(raw))) } catch { /* ignore */ }
    }
    const savedFilter = storage.getItem(REPO_FILTER_KEY)
    if (savedFilter != null) setRepoFilter(savedFilter)
    const savedGroupBy = storage.getItem(GROUP_BY_KEY)
    if (savedGroupBy === "status" || savedGroupBy === "repo") setGroupBy(savedGroupBy)
  }, [hydrated])

  // Persist UI prefs on change (skip until hydrated to avoid overwriting stored values)
  useEffect(() => {
    if (!hydrated) return
    getStorage().setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsed]))
  }, [hydrated, collapsed])

  useEffect(() => {
    if (!hydrated) return
    getStorage().setItem(REPO_FILTER_KEY, repoFilter)
  }, [hydrated, repoFilter])

  useEffect(() => {
    if (!hydrated) return
    getStorage().setItem(GROUP_BY_KEY, groupBy)
  }, [hydrated, groupBy])

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return { collapsed, repoFilter, groupBy, setRepoFilter, setGroupBy, toggleCollapsed }
}
