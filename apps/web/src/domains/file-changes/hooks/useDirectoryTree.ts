import { useCallback, useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import { api, queryKeys, type DirectoryEntry } from "@huxflux/shared"
import { usePersistentState } from "@/hooks/usePersistentState"

export interface DirectoryRow {
  kind: "entry"
  entry: DirectoryEntry
  depth: number
  expanded: boolean
}

export interface DirectoryLoadingRow {
  kind: "loading"
  path: string
  depth: number
}

function isStringArray(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.every((x) => typeof x === "string")
}

/**
 * Lazily loaded worktree tree for the Files section. Each expanded folder is
 * its own `listDirectory` query, so opening `node_modules` fetches one level
 * at a time. Expanded folders persist per agent.
 */
export function useDirectoryTree(agentId: string) {
  const [expandedList, setExpandedList] = usePersistentState<string[]>(`huxflux:files:expanded:${agentId}`, [], isStringArray)
  const expanded = useMemo(() => new Set(expandedList), [expandedList])
  const dirs = useMemo(() => ["", ...expandedList], [expandedList])

  const results = useQueries({
    queries: dirs.map((dir) => ({
      queryKey: queryKeys.agents.directory(agentId, dir),
      queryFn: () => api.agents.listDirectory(agentId, dir),
      staleTime: 30_000,
      retry: false,
    })),
  })

  const byDir = new Map<string, DirectoryEntry[] | undefined>()
  // A folder that vanished (or cannot be read) shows as empty instead of loading forever.
  dirs.forEach((dir, i) => byDir.set(dir, results[i]?.data ?? (results[i]?.isError ? [] : undefined)))
  const dataKey = results.map((r) => `${r.dataUpdatedAt}:${r.errorUpdatedAt}`).join(",")

  const rows = useMemo(() => {
    const out: Array<DirectoryRow | DirectoryLoadingRow> = []
    const walk = (dir: string, depth: number) => {
      const entries = byDir.get(dir)
      if (!entries) {
        out.push({ kind: "loading", path: dir, depth })
        return
      }
      for (const entry of entries) {
        const isOpen = entry.type === "directory" && expanded.has(entry.path)
        out.push({ kind: "entry", entry, depth, expanded: isOpen })
        if (isOpen) walk(entry.path, depth + 1)
      }
    }
    walk("", 0)
    return out
  // byDir is rebuilt every render; `dataKey` captures when any folder's data changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, expanded])

  const toggle = useCallback((path: string) => {
    setExpandedList((list) => (list.includes(path)
      ? list.filter((p) => p !== path && !p.startsWith(`${path}/`))
      : [...list, path]))
  }, [setExpandedList])

  const reveal = useCallback((dirsToOpen: string[]) => {
    setExpandedList((list) => {
      const missing = dirsToOpen.filter((d) => !list.includes(d))
      return missing.length ? [...list, ...missing] : list
    })
  }, [setExpandedList])

  return { rows, expanded, toggle, reveal, collapseAll: () => setExpandedList([]) }
}
