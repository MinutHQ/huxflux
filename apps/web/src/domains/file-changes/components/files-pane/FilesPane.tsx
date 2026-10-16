import { useCallback, useRef, useState, type ReactNode } from "react"
import type { EditorView } from "@codemirror/view"
import { openSearchPanel } from "@codemirror/search"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup, cn } from "@huxflux/ui"
import { IconCopy, IconFolders, IconLayoutSidebar, IconSearch, IconX } from "@tabler/icons-react"
import { useDefaultLayout } from "react-resizable-panels"
import { ancestorDirs, queryKeys, useAgentEvents, type Agent, type PRComment } from "@huxflux/shared"
import { usePersistentState } from "@/hooks/usePersistentState"
import { useDirectoryTree } from "../../hooks/useDirectoryTree"
import type { FileBuffers } from "../../hooks/useFileBuffers"
import { useFileTabsState } from "../../hooks/useFileTabsState"
import type { FileBuffer, OpenFileRequest } from "../../file-changes.types"
import { PaneMenu } from "../PaneMenu"
import { FileEditorArea } from "./FileEditorArea"
import { FileTabStrip } from "./FileTabStrip"
import { FilesSidebar } from "./FilesSidebar"
import { UnsavedChangesModal } from "./UnsavedChangesModal"

export interface FilesPaneProps {
  agent: Agent
  /** Unsaved drafts, owned by the workspace so they survive this pane remounting. */
  buffers: FileBuffers
  openRequest?: OpenFileRequest | null
  pendingComments: PRComment[]
  onAddComment: (c: PRComment) => void
  onRemoveComment: (id: string) => void
  controls?: ReactNode
}

/**
 * The side pane's Files section: the whole worktree as a lazy tree (ignored
 * files dimmed), a filter box that fuzzy-matches names or, with a leading
 * `?`, searches contents, preview/pinned tabs, and a CodeMirror editor with
 * Cmd+S save and line comments.
 */
export function FilesPane({ agent, buffers, openRequest, pendingComments, onAddComment, onRemoveComment, controls }: FilesPaneProps) {
  const tabs = useFileTabsState(agent.id)
  const tree = useDirectoryTree(agent.id)
  const queryClient = useQueryClient()
  const [treeVisible, setTreeVisible] = usePersistentState("huxflux:files:tree-visible", true, (r): r is boolean => typeof r === "boolean")
  const [filter, setFilter] = useState("")
  const [jump, setJump] = useState<{ path: string; line: number; nonce: number } | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const firstResult = useRef<{ path: string; line?: number } | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const layout = useDefaultLayout({ id: "huxflux-files-tree", panelIds: ["huxflux-files-tree-list", "huxflux-files-tree-body"] })

  const openFile = useCallback((path: string, opts: { pin?: boolean; line?: number } = {}) => {
    tabs.open(path, { pin: opts.pin })
    tree.reveal(ancestorDirs(path))
    if (opts.line) setJump({ path, line: opts.line, nonce: Date.now() })
  }, [tabs, tree])

  // Handle "open this file" requests from outside (e.g. the diff pane) during render, once per nonce.
  const [handledRequest, setHandledRequest] = useState<number | null>(null)
  if (openRequest && openRequest.nonce !== handledRequest) {
    setHandledRequest(openRequest.nonce)
    openFile(openRequest.path, { pin: true, line: openRequest.line })
  }

  // Worktree changed (the watcher fires after every refresh): reload the tree, open file and name index.
  useAgentEvents(agent.id, (event) => {
    if (event.type !== "file:changed") return
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.directoryRoot(agent.id) })
    queryClient.invalidateQueries({ queryKey: ["file-read", agent.id] })
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.filePaths(agent.id) })
  })

  const onBufferChange = buffers.update
  const onBufferEdit = useCallback((path: string, b: FileBuffer) => {
    onBufferChange(path, b)
    if (b.draft !== b.baseline) tabs.pin(path)
  }, [onBufferChange, tabs])

  function requestClose(path: string) {
    if (buffers.dirty.has(path)) setConfirmClose(path)
    else { buffers.drop(path); tabs.close(path) }
  }

  const handleFirstResult = useCallback((r: { path: string; line?: number } | null) => { firstResult.current = r }, [])
  const handleView = useCallback((v: EditorView | null) => { viewRef.current = v }, [])
  const active = tabs.active
  const activeJump = jump && jump.path === active ? { line: jump.line, nonce: jump.nonce } : undefined

  const sidebar = (
    <FilesSidebar
      agent={agent}
      filter={filter}
      onFilterChange={setFilter}
      inputRef={filterRef}
      tree={tree}
      activePath={active}
      onOpen={openFile}
      onFirstResult={handleFirstResult}
      onEnter={() => { if (firstResult.current) openFile(firstResult.current.path, { pin: true, line: firstResult.current.line }) }}
    />
  )

  const editor = active ? (
    <FileEditorArea
      agentId={agent.id}
      path={active}
      jump={activeJump}
      restored={buffers.get(active)}
      onBufferChange={onBufferEdit}
      comments={pendingComments}
      onAddComment={onAddComment}
      onRemoveComment={onRemoveComment}
      onView={handleView}
    />
  ) : (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
      <IconFolders size={22} className="text-muted-foreground/50" />
      <p className="text-[12px] text-muted-foreground">Pick a file from the tree, or type in the filter. Start with ? to search contents.</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 h-9 px-1.5 border-b border-border/60 shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={() => setTreeVisible((v) => !v)} title={treeVisible ? "Hide file tree" : "Show file tree"} className={cn(!treeVisible && "text-muted-foreground")}>
          <IconLayoutSidebar size={14} />
        </Button>
        <div className="flex-1 min-w-0">
          <FileTabStrip tabs={tabs.tabs} active={active} dirty={buffers.dirty} onSelect={tabs.select} onPin={tabs.pin} onClose={requestClose} />
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon-xs" title="Find in file (⌘F)" disabled={!active} onClick={() => { if (viewRef.current) openSearchPanel(viewRef.current) }}>
            <IconSearch size={14} />
          </Button>
          <PaneMenu
            items={[
              { label: "Copy path", icon: <IconCopy size={13} />, disabled: !active, onSelect: () => { if (active) navigator.clipboard.writeText(active).then(() => toast.success("Path copied")) } },
              { label: "Search in files", icon: <IconSearch size={13} />, onSelect: () => { setTreeVisible(true); setFilter("?"); setTimeout(() => filterRef.current?.focus(), 30) } },
              "separator",
              { label: "Collapse folders", icon: <IconFolders size={13} />, onSelect: tree.collapseAll },
              { label: "Close all tabs", icon: <IconX size={13} />, disabled: tabs.tabs.length === 0 || buffers.dirty.size > 0, onSelect: tabs.closeAll },
            ]}
          />
          {controls}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {treeVisible ? (
          <ResizablePanelGroup orientation="horizontal" className="h-full" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
            <ResizablePanel id="huxflux-files-tree-list" defaultSize="30" minSize="15" maxSize="55">{sidebar}</ResizablePanel>
            <ResizableHandle className="w-0 bg-transparent" />
            <ResizablePanel id="huxflux-files-tree-body" minSize="35">{editor}</ResizablePanel>
          </ResizablePanelGroup>
        ) : editor}
      </div>
      {confirmClose && (
        <UnsavedChangesModal
          path={confirmClose}
          onCancel={() => setConfirmClose(null)}
          onDiscard={() => { buffers.drop(confirmClose); tabs.close(confirmClose); setConfirmClose(null) }}
          onSave={() => {
            const path = confirmClose
            setConfirmClose(null)
            buffers.saveBuffer(path).then(() => tabs.close(path)).catch(() => { /* toast already shown */ })
          }}
        />
      )}
    </div>
  )
}
