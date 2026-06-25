import { createRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router"
import { useState, useEffect, useCallback, useRef } from "react"

import type { PanelImperativeHandle } from "react-resizable-panels"
import { useDefaultLayout } from "react-resizable-panels"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { Sidebar } from "@/app-shell/sidebar/Sidebar"
import { useAgents, useServerConfig, getServers as getServersList } from "@huxflux/shared"
import { useNotifications } from "@/app-shell/useNotifications"

import { usePRs } from "@/domains/pull-requests/usePRs"
import { WorkspaceProvider } from "@/app-shell/workspace"

import { getFlag } from "@/lib/flags"
import { isTauri, isMacOS } from "@/lib/platform"
import { tryAutoConnectSync } from "@/lib/autoConnect"
import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react"
import { Button } from "@huxflux/ui"
import { loadRefineSessions, saveRefineSessions } from "@/domains/tasks/utils"
import type { RefineSession } from "@/domains/tasks/tasks.types"
import { Route as rootRoute } from "./__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  beforeLoad: () => {
    // Try to auto-connect before checking servers.
    // Works on Tauri (connection.json injected at startup) and bundled web UI
    // (server injects connection data into index.html).
    if (getServersList().length === 0) {
      tryAutoConnectSync()
      // Re-check after potential sync auto-connect
      if (getServersList().length === 0) {
        throw redirect({ to: "/onboarding" })
      }
    }
  },
  component: AppLayout,
})

import { AppContext, type AppContextValue } from "@/hooks/useAppContext"
export { useAppContext } from "@/hooks/useAppContext"

function AppLayout() {
  const navigate = useNavigate()
  const { data: agents = [] } = useAgents()

  const sidebarRef = useRef<PanelImperativeHandle>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [floatingSidebar, setFloatingSidebar] = useState(false)
  const floatingRef = useRef<HTMLDivElement>(null)
  const sidebarLayout = useDefaultLayout({ id: "huxflux-sidebar", panelIds: ["huxflux-sidebar-panel", "huxflux-content-panel"] })

  const toggleSidebar = useCallback(() => {
    const willCollapse = !sidebarRef.current?.isCollapsed()
    setSidebarCollapsed(willCollapse)
    // Expanding the sidebar dismisses the floating overlay so the two never
    // render at once. Done here (not in an effect) to avoid cascading renders.
    if (!willCollapse) setFloatingSidebar(false)
    if (willCollapse) {
      sidebarRef.current?.collapse()
    } else {
      sidebarRef.current?.expand()
    }
  }, [])

  // Listen for sidebar toggle from root keyboard shortcut
  useEffect(() => {
    function onToggle() { toggleSidebar() }
    window.addEventListener("huxflux:toggle-sidebar", onToggle)
    return () => window.removeEventListener("huxflux:toggle-sidebar", onToggle)
  }, [toggleSidebar])

  // Floating sidebar: show when mouse is near left edge while collapsed
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!sidebarCollapsed) return
      if (e.clientX < 20) {
        setFloatingSidebar(true)
      }
    }
    window.addEventListener("mousemove", onMouseMove)
    return () => window.removeEventListener("mousemove", onMouseMove)
  }, [sidebarCollapsed])

  useNotifications(agents)

  const prReviewEnabled = getFlag("prReview")
  const { githubEnabled, feedbackEnabled } = useServerConfig()
  const { prs, isLoading: prsLoading, refetch: refetchPRs } = usePRs()

  const [refineSessions, setRefineSessions] = useState<RefineSession[]>(() => loadRefineSessions())

  function handleNewRefine(ticketId: string) {
    const id = `refine-${Date.now()}`
    const openingMessage = {
      id: `agent-open-${Date.now()}`,
      role: "agent" as const,
      content: `I'll help you refine **${ticketId}** into actionable subtasks.\n\nFirst — which repositories are involved in this change?`,
      type: "repo-select" as const,
      timestamp: new Date().toISOString(),
    }
    const session: RefineSession = {
      id,
      ticketId,
      status: "repos",
      repoIds: [],
      messages: [openingMessage],
      answers: [],
      subtasks: [],
      createdAt: new Date().toISOString(),
    }
    const next = [...refineSessions, session]
    setRefineSessions(next)
    saveRefineSessions(next)
    navigate({ to: "/refine/$sessionId", params: { sessionId: id } })
  }

  const appCtx: AppContextValue = {
    prs,
    prsLoading,
    refetchPRs,
    refineSessions,
    setRefineSessions,
    feedbackEnabled,
    githubEnabled,
    sidebarCollapsed,
  }

  const sidebarProps = {
    agents,
    onOpenSettings: () => navigate({ to: "/settings" }),
    prs: prReviewEnabled ? prs : [],
    prsLoading,
    onRefetchPRs: refetchPRs,
    refineSessions,
    onNewRefine: handleNewRefine,
    feedbackEnabled,
    sidebarCollapsed,
    onToggleSidebar: toggleSidebar,
  }

  return (
    <AppContext.Provider value={appCtx}>
      <WorkspaceProvider agents={agents}>
        <div className="relative flex flex-1 min-h-0 w-full overflow-hidden">
          {/* Collapsed-only expand button - floats right of the traffic lights so
              the sidebar can be reopened. Hidden while the floating overlay is
              open (the overlay's own header carries the toggle). When expanded,
              the toggle lives in the sidebar header instead. */}
          {isTauri && isMacOS && sidebarCollapsed && !floatingSidebar && (
            <div className="absolute left-[84px] z-40" style={{ top: 14 }}>
              <Button variant="ghost" size="icon-xs" onClick={toggleSidebar} title="Show sidebar (⌘B)">
                <IconLayoutSidebarLeftExpand size={14} />
              </Button>
            </div>
          )}
          <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 w-full" defaultLayout={sidebarLayout.defaultLayout} onLayoutChanged={sidebarLayout.onLayoutChanged}>
              <ResizablePanel
                id="huxflux-sidebar-panel"
                panelRef={sidebarRef}
                defaultSize="18"
                minSize="12"
                maxSize="28"
                collapsible
                collapsedSize="0"
                className="overflow-hidden"
              >
                <Sidebar {...sidebarProps} />
              </ResizablePanel>

              <ResizableHandle className="w-0 bg-transparent" />

              <ResizablePanel id="huxflux-content-panel" defaultSize="82" minSize="50" className="min-w-0 relative z-10">
                <div className="flex h-full overflow-hidden">
                  <Outlet />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>

          {/* Floating sidebar overlay when collapsed + mouse proximity */}
          {sidebarCollapsed && (
            <div
              ref={floatingRef}
              onMouseLeave={() => setFloatingSidebar(false)}
              className="absolute left-1.5 top-1.5 bottom-1.5 z-50 rounded-xl shadow-2xl border border-border/50 bg-sidebar overflow-hidden transition-all duration-200 ease-out"
              style={{
                width: "260px",
                transform: floatingSidebar ? "translateX(0)" : "translateX(-110%)",
                opacity: floatingSidebar ? 1 : 0,
                pointerEvents: floatingSidebar ? "auto" : "none",
              }}
            >
              <Sidebar {...sidebarProps} />
            </div>
          )}
        </div>
      </WorkspaceProvider>
    </AppContext.Provider>
  )
}


