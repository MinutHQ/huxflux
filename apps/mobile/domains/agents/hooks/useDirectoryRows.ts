import { useCallback, useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { api, queryKeys, type DirectoryEntry } from "@huxflux/shared"

export type DirectoryRow =
  | { kind: "entry"; entry: DirectoryEntry; depth: number; expanded: boolean }
  | { kind: "loading"; path: string; depth: number }

/**
 * Lazily loaded worktree tree for the mobile Files tab: one `listDirectory`
 * query per expanded folder, flattened into rows for a virtualised list.
 */
export function useDirectoryRows(agentId: string) {
  const [expanded, setExpanded] = useState<string[]>([])
  const dirs = useMemo(() => ["", ...expanded], [expanded])
  const results = useQueries({
    queries: dirs.map((dir) => ({
      queryKey: queryKeys.agents.directory(agentId, dir),
      queryFn: () => api.agents.listDirectory(agentId, dir),
      staleTime: 30_000,
      retry: false,
    })),
  })

  const dataKey = results.map((r) => `${r.dataUpdatedAt}:${r.errorUpdatedAt}`).join(",")
  const rows = useMemo(() => {
    const byDir = new Map<string, DirectoryEntry[] | undefined>()
    dirs.forEach((dir, i) => byDir.set(dir, results[i]?.data ?? (results[i]?.isError ? [] : undefined)))
    const open = new Set(expanded)
    const out: DirectoryRow[] = []
    const walk = (dir: string, depth: number) => {
      const entries = byDir.get(dir)
      if (!entries) { out.push({ kind: "loading", path: dir, depth }); return }
      for (const entry of entries) {
        const isOpen = entry.type === "directory" && open.has(entry.path)
        out.push({ kind: "entry", entry, depth, expanded: isOpen })
        if (isOpen) walk(entry.path, depth + 1)
      }
    }
    walk("", 0)
    return out
  // `results` is a new array every render; `dataKey` captures when any folder's data changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, dirs, expanded])

  const toggle = useCallback((path: string) => {
    setExpanded((list) => (list.includes(path) ? list.filter((p) => p !== path && !p.startsWith(`${path}/`)) : [...list, path]))
  }, [])

  // Older servers have no /files/list; surface that instead of an empty tree.
  const rootError = results[0]?.error ?? null

  return { rows, toggle, rootError }
}
