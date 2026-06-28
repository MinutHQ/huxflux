import { useEffect, useMemo, useRef, useState } from "react"
import { FileTree, useFileTree } from "@pierre/trees/react"
import type { GitStatusEntry } from "@pierre/trees"
import { api, type FileChange, queryKeys, useHuxfluxQuery, useRepos } from "@huxflux/shared"
import type { FileTreeEntry } from "../file-changes.types"
import { useTreeThemeStyles } from "../hooks/useTreeThemeStyles"

function stripPathCollisions(paths: string[]): string[] {
  const dirPrefixes = new Set<string>()
  for (const p of paths) {
    const parts = p.split("/")
    for (let i = 1; i < parts.length; i++) dirPrefixes.add(parts.slice(0, i).join("/"))
  }
  return paths.filter((p) => !dirPrefixes.has(p))
}

interface FileTreeViewProps {
  agentId: string
  repoId: string | null
  fileChanges: FileChange[]
  changedOnly: boolean
  search: string
  onFileContentSelect: (path: string) => void
}

/**
 * The "All files" body. Pierre's `FileTree` (virtualised, themable, search-
 * aware) is the renderer; the data layer wires up the agent file-tree query,
 * git-status decoration from `fileChanges`, and folder-agent lazy loading.
 *
 * Behaviour:
 *  - Git agents: one query fetches the full repo tree; we flatten it to paths
 *    and feed pierre as a single reset.
 *  - Folder agents: the initial query returns only the root entries. As the
 *    user expands directories pierre's mutation subscription detects the new
 *    expansion and we fetch that subdirectory's entries on demand.
 *  - `changedOnly` short-circuits the fetch and feeds only the changed paths.
 *  - `search` drives pierre's built-in search (hide-non-matches mode).
 *  - Selecting a file fires `onFileContentSelect(path)`.
 */
export function FileTreeView({ agentId, repoId, fileChanges, changedOnly, search, onFileContentSelect }: FileTreeViewProps) {
  const treeThemeStyles = useTreeThemeStyles()
  const { data: repos = [] } = useRepos()
  const isFolderAgent = repos.find((r) => r.id === repoId)?.type === "folder"

  // Initial query: full tree for git agents, root entries for folder agents
  // (the server returns shallow entries when the repo is folder-type).
  const { data: rootTree, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileTree(agentId),
    queryFn: () => api.agents.fileTree(agentId),
    staleTime: 30_000,
    enabled: !changedOnly,
  })

  // Folder-agent incremental path set + load tracking. Empty string is the
  // root marker; non-root entries are kept verbatim (pierre handles segments).
  const [folderPaths, setFolderPaths] = useState<Set<string>>(new Set())
  const loadedDirs = useRef<Set<string>>(new Set())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset folder-agent bookkeeping when the agent changes
    setFolderPaths(new Set())
    loadedDirs.current = new Set()
  }, [agentId])

  useEffect(() => {
    if (!isFolderAgent || !rootTree) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seed folder paths from the root response (external data, single-shot)
    setFolderPaths((prev) => {
      const next = new Set(prev)
      for (const e of rootTree as FileTreeEntry[]) next.add(e.path)
      return next
    })
    loadedDirs.current.add("")
  }, [rootTree, isFolderAgent])

  // Flatten the repo tree into a path list for pierre.
  const allPaths = useMemo(() => {
    if (changedOnly) return stripPathCollisions(fileChanges.map((f) => f.path))
    if (isFolderAgent) return stripPathCollisions(Array.from(folderPaths).sort())
    if (!rootTree) return []
    const paths: string[] = []
    function walk(entries: FileTreeEntry[]) {
      for (const e of entries) {
        if (e.type === "file") paths.push(e.path)
        if (e.children) walk(e.children)
      }
    }
    walk(rootTree as FileTreeEntry[])
    return stripPathCollisions(paths)
  }, [rootTree, fileChanges, changedOnly, isFolderAgent, folderPaths])

  // Git status decoration: map each changed file to added/deleted/modified.
  const gitStatus = useMemo<GitStatusEntry[]>(
    () => fileChanges.map((f) => ({
      path: f.path,
      status: f.deletions === 0 ? "added" as const
        : f.additions === 0 ? "deleted" as const
        : "modified" as const,
    })),
    [fileChanges],
  )

  // Pierre's onSelectionChange closure captures the handler once at mount, so
  // we keep a ref to the latest version and dispatch through it.
  const onSelectRef = useRef(onFileContentSelect)
  useEffect(() => { onSelectRef.current = onFileContentSelect }, [onFileContentSelect])

  const { model } = useFileTree({
    paths: allPaths,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    icons: { set: "complete", colored: true },
    density: "compact",
    flattenEmptyDirectories: true,
    gitStatus,
    initialExpansion: changedOnly ? "open" : "closed",
    onSelectionChange: (selectedPaths) => {
      const p = selectedPaths[0]
      if (p) onSelectRef.current(p)
    },
  })

  // Sync pierre with allPaths.
  //   • Git agents (and changed-only mode): reset wholesale on every change.
  //   • Folder agents: incremental `add` so per-directory expansion survives
  //     across lazy fetches.
  const prevAllPathsRef = useRef<string[]>([])
  useEffect(() => {
    if (!isFolderAgent || changedOnly) {
      model.resetPaths(allPaths)
      prevAllPathsRef.current = allPaths
      return
    }
    const prev = new Set(prevAllPathsRef.current)
    const toAdd = allPaths.filter((p) => !prev.has(p))
    if (prevAllPathsRef.current.length === 0 && allPaths.length > 0) {
      model.resetPaths(allPaths)
    } else if (toAdd.length > 0) {
      model.batch(toAdd.map((path) => ({ type: "add" as const, path })))
    }
    prevAllPathsRef.current = allPaths
  }, [allPaths, model, isFolderAgent, changedOnly])

  useEffect(() => {
    model.setGitStatus(gitStatus)
  }, [gitStatus, model])

  // External search input drives pierre's search.
  useEffect(() => {
    model.setSearch(search || null)
  }, [search, model])

  // Folder-agent lazy expansion: poll for newly-expanded directories on every
  // pierre mutation and fetch their immediate children. Pierre doesn't expose
  // explicit expand events so we scan known paths whose handle reports expanded.
  useEffect(() => {
    if (!isFolderAgent) return
    let cancelled = false
    const checkExpansions = () => {
      if (cancelled) return
      for (const p of folderPaths) {
        if (loadedDirs.current.has(p)) continue
        const handle = model.getItem(p)
        // Pierre's isDirectory() returns a literal `true`/`false` per the
        // discriminated union, but TS won't narrow off a method call. Guard
        // the directory case manually before accessing isExpanded().
        if (!handle || !handle.isDirectory()) continue
        const dirHandle = handle as Extract<typeof handle, { isExpanded(): boolean }>
        if (dirHandle.isExpanded()) {
          loadedDirs.current.add(p)
          const subPath = p.replace(/\/+$/, "")
          api.agents.fileTree(agentId, subPath)
            .then((children) => {
              if (cancelled) return
              setFolderPaths((prev) => {
                const next = new Set(prev)
                for (const e of children as FileTreeEntry[]) next.add(e.path)
                return next
              })
            })
            .catch(() => {
              // Allow another attempt on the next expansion check.
              loadedDirs.current.delete(p)
            })
        }
      }
    }
    const unsubscribe = model.subscribe(checkExpansions)
    // Run once in case directories were already expanded.
    checkExpansions()
    return () => { cancelled = true; unsubscribe() }
  }, [model, isFolderAgent, agentId, folderPaths])

  if (isLoading && !changedOnly) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-xs text-muted-foreground/40">Loading...</p>
      </div>
    )
  }

  return <FileTree model={model} className="h-full" style={treeThemeStyles} />
}
