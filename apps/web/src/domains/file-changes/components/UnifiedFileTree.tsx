import React, { Component, useState, type ReactNode } from "react"
import type { FileChange } from "@huxflux/shared"
import { FileSearchBar } from "./FileSearchBar"
import { FileTreeView } from "./FileTreeView"
import { UnifiedFileTreeTabs } from "./UnifiedFileTreeTabs"

interface UnifiedFileTreeProps {
  agentId: string
  /** Owning repo id (nullable for legacy agents). Needed to detect folder-type repos. */
  repoId: string | null
  fileChanges: FileChange[]
  onFileContentSelect: (path: string) => void
  onOpenDiffBrowser?: (scrollToPath?: string) => void
  onOpenPRTab?: () => void
  hasPR?: boolean
  prView?: React.ReactNode
}

type ActiveView = "all" | "diff" | "pr"

/**
 * Inner tab orchestrator for the file/diff/PR view. Both the "All files" and
 * "Diff" tabs render the same pierre `FileTreeView`; the diff tab restricts
 * the tree to changed files only. The PR tab renders the caller-provided
 * `prView`.
 */
export function UnifiedFileTree({
  agentId,
  repoId,
  fileChanges,
  onFileContentSelect,
  onOpenDiffBrowser,
  onOpenPRTab,
  hasPR,
  prView,
}: UnifiedFileTreeProps) {
  const [search, setSearch] = useState("")
  const [activeView, setActiveView] = useState<ActiveView>("diff")

  function switchToAll() { setActiveView("all") }
  function switchToDiff() { setActiveView("diff") }
  function switchToPR() { setActiveView("pr") }

  return (
    <div className="flex flex-col h-full">
      <UnifiedFileTreeTabs
        activeView={activeView}
        fileChangesCount={fileChanges.length}
        hasPR={!!hasPR}
        onSwitchToAll={switchToAll}
        onSwitchToDiff={switchToDiff}
        onSwitchToPR={switchToPR}
        onOpenDiffBrowser={onOpenDiffBrowser}
        onOpenPRTab={onOpenPRTab}
      />

      {activeView !== "pr" && <FileSearchBar value={search} onChange={setSearch} />}

      {activeView === "pr" && prView ? (
        <div className="flex-1 min-h-0">{prView}</div>
      ) : (
        <div className="flex-1 min-h-0">
          <PanelErrorBoundary key={agentId}>
            <FileTreeView
              agentId={agentId}
              repoId={repoId}
              fileChanges={fileChanges}
              changedOnly={activeView === "diff"}
              search={search}
              onFileContentSelect={(path) => {
                if (onOpenDiffBrowser && fileChanges.some((f) => f.path === path)) {
                  onOpenDiffBrowser(path)
                  return
                }
                onFileContentSelect(path)
              }}
            />
          </PanelErrorBoundary>
        </div>
      )}
    </div>
  )
}

class PanelErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center py-12 px-4">
          <div className="space-y-2 text-center">
            <p className="text-xs text-muted-foreground">Failed to render file tree</p>
            <p className="text-[11px] text-muted-foreground/60">{this.state.error.message}</p>
            <button className="text-xs underline text-muted-foreground" onClick={() => this.setState({ error: null })}>
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
