import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { IconFiles } from "@tabler/icons-react"
import { api, orderChangedFiles, queryKeys, useHuxfluxQuery, useRepos, type Agent, type PRComment } from "@huxflux/shared"
import { useDiffPaneState } from "../../hooks/useDiffPaneState"
import { useActiveSection } from "../../hooks/useActiveSection"
import { TreeSplit } from "../TreeSplit"
import { ChangedFilesTree } from "./ChangedFilesTree"
import { DiffFileSection } from "./DiffFileSection"
import { DiffPaneHeader } from "./DiffPaneHeader"

export interface DiffPaneProps {
  agent: Agent
  /** Scroll to this file. Bump `nonce` to repeat a jump to the same path. */
  focusRequest?: { path: string; nonce: number } | null
  onOpenFile: (path: string) => void
  pendingComments: PRComment[]
  onAddComment: (c: PRComment) => void
  onRemoveComment: (id: string) => void
  /** Window controls (maximize / close) rendered at the right of the header. */
  controls?: ReactNode
}

/**
 * The side pane's Diff section: changed-files tree on the left, every changed
 * file stacked on the right with sticky collapsible headers. Clicking a file
 * in the tree scrolls to it. The base can be the branch point or HEAD.
 */
export function DiffPane({ agent, focusRequest, onOpenFile, pendingComments, onAddComment, onRemoveComment, controls }: DiffPaneProps) {
  const state = useDiffPaneState(agent.id)
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
  const [jumpTarget, setJumpTarget] = useState<string | null>(null)
  const sectionRefs = useRef(new Map<string, HTMLDivElement>())
  const queryClient = useQueryClient()
  const { data: repos = [] } = useRepos()
  const repo = repos.find((r) => r.id === agent.repoId)

  const { data: diffs, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.agents.allDiffs(agent.id, state.base),
    queryFn: () => api.agents.allDiffs(agent.id, state.base),
    staleTime: 5 * 60_000,
    // Commits do not touch the worktree files, so the uncommitted view also rechecks on focus.
    refetchOnWindowFocus: state.base === "uncommitted",
    // The watcher sends file:changed after every worktree refresh, even when the +/- counts stay the same.
    on: { "file:changed": (event, h) => { if (event.agentId === agent.id) h.invalidate() } },
  })

  const ordered = useMemo(() => orderChangedFiles(diffs ?? []), [diffs])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? ordered.filter((d) => d.path.toLowerCase().includes(q)) : ordered
  }, [ordered, search])
  // Until the diffs arrive, the tree shows the change list the agent already carries (branch base only).
  const treeFiles = useMemo(() => {
    if (diffs) return visible
    const q = search.trim().toLowerCase()
    const pending = state.base === "branch" ? agent.fileChanges : []
    return q ? pending.filter((f) => f.path.toLowerCase().includes(q)) : pending
  }, [diffs, visible, search, state.base, agent.fileChanges])
  const activePath = useActiveSection(scrollRoot, sectionRefs.current, visible.map((d) => d.path))

  function jumpTo(path: string) {
    state.expand(path)
    setJumpTarget(path)
    if (!state.diffVisible) state.setDiffVisible(true)
    // Two frames: the diff body may only mount on the next commit when it was closed.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sectionRefs.current.get(path)?.scrollIntoView({ block: "start" })
    }))
  }

  const lastFocusNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!focusRequest || !diffs || lastFocusNonce.current === focusRequest.nonce) return
    lastFocusNonce.current = focusRequest.nonce
    jumpTo(focusRequest.path)
  // jumpTo is recreated each render; the request nonce is what drives this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, diffs])

  const body = (
    <div ref={setScrollRoot} className="h-full overflow-y-auto">
      {isLoading ? (
        <p className="py-12 text-center text-xs text-muted-foreground">Loading diffs...</p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <IconFiles size={22} className="text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            {search ? "No matching files" : state.base === "uncommitted" ? "No uncommitted changes" : "No changes"}
          </p>
        </div>
      ) : (
        visible.map((d) => (
          <DiffFileSection
            key={d.path}
            ref={(el) => { if (el) sectionRefs.current.set(d.path, el); else sectionRefs.current.delete(d.path) }}
            agentId={agent.id}
            diff={d}
            collapsed={state.collapsed.has(d.path)}
            diffStyle={state.diffStyle}
            scrollRoot={scrollRoot}
            eager={d.path === jumpTarget}
            onToggle={() => state.toggleCollapsed(d.path)}
            onOpenFile={onOpenFile}
            pendingComments={pendingComments}
            onAddComment={onAddComment}
            onRemoveComment={onRemoveComment}
          />
        ))
      )}
    </div>
  )

  const tree = (
    <div className="flex flex-col h-full">
      {searchOpen && (
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearch("") } }}
          placeholder="Filter changed files"
          className="mx-1.5 mt-1.5 h-7 px-2 rounded-md bg-background border border-border/60 text-[12px] outline-none focus:border-ring"
        />
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ChangedFilesTree files={treeFiles} activePath={state.diffVisible ? activePath : null} onSelect={jumpTo} />
      </div>
    </div>
  )

  // The tree always shows when the diff is closed, so the pane is never empty.
  const showTree = state.treeVisible || !state.diffVisible

  return (
    <div className="flex flex-col h-full min-h-0">
      <DiffPaneHeader
        baseBranch={(agent.baseBranch ?? repo?.branchFrom ?? "base").replace(/^origin\//, "")}
        branch={agent.branch}
        base={state.base}
        onBaseChange={state.setBase}
        treeVisible={showTree}
        onToggleTree={() => {
          if (showTree && !state.diffVisible) state.setDiffVisible(true)
          state.setTreeVisible(!showTree)
        }}
        diffVisible={state.diffVisible}
        onToggleDiff={() => {
          if (state.diffVisible) state.setTreeVisible(true)
          state.setDiffVisible((v) => !v)
        }}
        searchOpen={searchOpen}
        onToggleSearch={() => { setSearchOpen((o) => !o); setSearch("") }}
        diffStyle={state.diffStyle}
        onDiffStyleChange={state.setDiffStyle}
        onExpandAll={state.expandAll}
        onCollapseAll={() => state.collapseAll(ordered.map((d) => d.path))}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.agents.allDiffs(agent.id) })}
        controls={controls}
      />
      <div className="flex-1 min-h-0">
        {!state.diffVisible ? tree : showTree ? (
          <TreeSplit id="huxflux-diff-tree" tree={tree} body={body} treeSize={{ default: "28", min: "12", max: "50" }} bodyMinSize="40" />
        ) : body}
      </div>
    </div>
  )
}
