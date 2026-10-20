import { useEffect, useRef, useState, type ReactNode } from "react"
import { DockviewReact, type DockviewReadyEvent, type DockviewTheme, type DockviewWillShowOverlayLocationEvent } from "dockview-react"
import "dockview-react/dist/styles/dockview.css"
import "./workspaceDock.css"
import type { WorkspacePaneId } from "../../agents.types"
import type { DockHandle } from "../../agents.types"
import type { AgentWorkspaceLayout } from "../../hooks/useAgentWorkspaceLayout"
import { reconcilePanes, restoreLayout, saveLayout } from "../../service/workspaceDock"
import { DockHeaderActions } from "./DockHeaderActions"
import { DockPane } from "./DockPane"
import { DockTab } from "./DockTab"
import { WorkspacePanesContext } from "./WorkspacePanesContext"

const components = { pane: DockPane }

const theme: DockviewTheme = {
  name: "huxflux",
  className: "dockview-theme-huxflux",
  colorScheme: "dark",
  gap: 4,
  dndOverlayMounting: "absolute",
  dndPanelOverlay: "group",
  dndTabIndicator: "line",
}

/**
 * The chat never shares a tab group: it cannot be dropped into another group
 * and nothing can be dropped into its group. Splitting beside it (its edges)
 * and the layout's outer edges stay allowed.
 */
function guardChatDrop(e: DockviewWillShowOverlayLocationEvent): void {
  const data = e.getData()
  const draggedGroup = data ? e.api.getGroup(data.groupId) : undefined
  const draggingChat = data?.panelId === "chat" || (data?.panelId === null && !!draggedGroup?.panels.some((p) => p.id === "chat"))
  const intoGroup = e.kind === "tab" || e.kind === "header_space" || (e.kind === "content" && e.position === "center")
  const targetHasChat = !!e.group?.panels.some((p) => p.id === "chat")
  if (intoGroup && (draggingChat || targetHasChat)) e.preventDefault()
}

interface WorkspaceDockProps {
  ui: AgentWorkspaceLayout
  content: Record<WorkspacePaneId, ReactNode>
}

/**
 * The agent workspace's dockable panes. The arrangement is one global
 * dockview layout saved to localStorage; which panes are in it follows the
 * active agent's visibility (`ui.visible`), reconciled whenever it changes.
 */
export function WorkspaceDock({ ui, content }: WorkspaceDockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [handle, setHandle] = useState<DockHandle | null>(null)
  const { dockRef, pendingFocusRef, visible, settled } = ui

  const onReady = (e: DockviewReadyEvent) => {
    const container = containerRef.current
    if (!container) return
    if (!restoreLayout(e.api)) e.api.clear()
    e.api.onWillShowOverlay(guardChatDrop)
    e.api.onDidLayoutChange(() => saveLayout(e.api))
    setHandle({ api: e.api, container })
  }

  // The hook's ref lets header toggles and shortcuts reach the live dock.
  useEffect(() => {
    dockRef.current = handle
    return () => { dockRef.current = null }
  }, [handle, dockRef])

  useEffect(() => {
    if (!handle || !settled) return
    reconcilePanes(handle.api, visible, handle.container, pendingFocusRef.current)
    pendingFocusRef.current = undefined
  }, [handle, visible, settled, pendingFocusRef])

  return (
    <WorkspacePanesContext.Provider value={{ content, ui }}>
      <div className="flex-1 min-h-0 p-1 pt-0">
        <div ref={containerRef} className="h-full">
          <DockviewReact
            className="h-full"
            theme={theme}
            components={components}
            defaultTabComponent={DockTab}
            rightHeaderActionsComponent={DockHeaderActions}
            disableFloatingGroups
            defaultRenderer="always"
            onReady={onReady}
          />
        </div>
      </div>
    </WorkspacePanesContext.Provider>
  )
}
