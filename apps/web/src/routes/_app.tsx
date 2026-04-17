import { createRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router"
import { useState, useEffect, useCallback, useRef } from "react"
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { useDefaultLayout } from "react-resizable-panels"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { Sidebar } from "@/components/Sidebar"
import { useAgents, useServerConfig, getServers as getServersList } from "@huxflux/shared"
import { useNotifications } from "@/hooks/useNotifications"

import { usePRs } from "@/hooks/usePRs"
import { useBulkReview } from "@/hooks/useBulkReview"
import { WorkspaceProvider } from "@/hooks/useWorkspaceContext"
import { PaneLayoutProvider, usePaneLayoutContext } from "@/hooks/usePaneLayoutContext"
import { getFlag } from "@/lib/flags"
import { loadRefineSessions, saveRefineSessions, type RefineSession } from "@/components/RefineView"
import { Route as rootRoute } from "./__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  beforeLoad: () => {
    if (getServersList().length === 0) {
      throw redirect({ to: "/onboarding" })
    }
  },
  component: AppLayout,
})

import { AppContext, type AppContextValue, DndDraggingContext, DndJustDraggedContext } from "@/hooks/useAppContext"
export { useAppContext, useIsDragging, useDndJustDragged } from "@/hooks/useAppContext"

function AppLayout() {
  const navigate = useNavigate()
  const { data: agents = [] } = useAgents()

  const sidebarRef = useRef<PanelImperativeHandle>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sidebarLayout = useDefaultLayout({ id: "huxflux-sidebar", panelIds: ["huxflux-sidebar-panel", "huxflux-content-panel"] })

  const toggleSidebar = useCallback(() => {
    if (sidebarRef.current?.isCollapsed()) {
      sidebarRef.current.expand()
    } else {
      sidebarRef.current?.collapse()
    }
  }, [])

  // Listen for sidebar toggle from root keyboard shortcut
  useEffect(() => {
    function onToggle() { toggleSidebar() }
    window.addEventListener("huxflux:toggle-sidebar", onToggle)
    return () => window.removeEventListener("huxflux:toggle-sidebar", onToggle)
  }, [toggleSidebar])

  useNotifications(agents)

  const prReviewEnabled = getFlag("prReview")
  const { githubEnabled, feedbackEnabled } = useServerConfig()
  const { prs, isLoading: prsLoading, refetch: refetchPRs } = usePRs()
  const [reviewedPrIds, setReviewedPrIds] = useState<Set<string>>(new Set())
  const [userReviewedPrIds, setUserReviewedPrIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("huxflux:user-reviewed") ?? "[]")) }
    catch { return new Set() }
  })
  const [submittedPrIds, setSubmittedPrIds] = useState<Set<string>>(new Set())
  const bulkReview = useBulkReview((prId) => setReviewedPrIds((prev) => new Set([...prev, prId])))

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
    reviewedPrIds,
    setReviewedPrIds,
    userReviewedPrIds,
    setUserReviewedPrIds,
    submittedPrIds,
    setSubmittedPrIds,
    bulkReview,
    refineSessions,
    setRefineSessions,
    feedbackEnabled,
    githubEnabled,
  }

  const sidebarProps = {
    agents,
    onOpenSettings: () => navigate({ to: "/settings" }),
    prs: prReviewEnabled ? prs.map((p) => ({
      ...p,
      reviewReady: reviewedPrIds.has(p.id) || !!(p.repoId && localStorage.getItem(`huxflux:review:${p.repoId}:${p.number}`)),
      userReviewed: p.userReviewed || userReviewedPrIds.has(p.id),
      reviewRequested: submittedPrIds.has(p.id) ? false : p.reviewRequested,
    })) : [],
    prsLoading,
    onRefetchPRs: refetchPRs,
    refineSessions,
    onNewRefine: handleNewRefine,
    onToggle: toggleSidebar,
    feedbackEnabled,
    bulkReviewingIds: bulkReview.reviewingIds,
    isBulkReviewing: bulkReview.isBulkReviewing,
    onBulkReview: () => bulkReview.startBulkReview(prs),
    onCancelBulkReview: bulkReview.cancelBulkReview,
    bulkReviewConcurrency: bulkReview.concurrency,
    onBulkReviewConcurrencyChange: bulkReview.updateConcurrency,
  }

  return (
    <AppContext.Provider value={appCtx}>
      <WorkspaceProvider agents={agents}>
      <PaneLayoutProvider agents={agents} initialAgentId={agents[0]?.id ?? null}>
        <DndWrapper>
          <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 w-full" defaultLayout={sidebarLayout.defaultLayout} onLayoutChanged={sidebarLayout.onLayoutChanged}>
            <ResizablePanel
              id="huxflux-sidebar-panel"
              panelRef={sidebarRef}
              defaultSize="18"
              minSize="12"
              maxSize="28"
              collapsible
              collapsedSize="0"
              onResize={(size) => setSidebarCollapsed(size.asPercentage < 1)}
              className="overflow-hidden"
            >
              <Sidebar {...sidebarProps} />
            </ResizablePanel>

            <ResizableHandle className="w-0 bg-transparent" />

            <ResizablePanel id="huxflux-content-panel" defaultSize="82" minSize="50" className="min-w-0 relative z-10 py-1 pr-1">
              <div className="flex h-full bg-background rounded-xl shadow-[-4px_0_16px_-4px_rgba(0,0,0,0.12)] overflow-hidden">
                {sidebarCollapsed && (
                  <button
                    onClick={toggleSidebar}
                    title="Show sidebar (⌘B)"
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-3.5 h-10 bg-sidebar border border-border border-l-0 rounded-r-md shadow-sm hover:bg-muted transition-colors"
                  >
                    <svg width="8" height="12" viewBox="0 0 8 12" className="text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 1l6 5-6 5" />
                    </svg>
                  </button>
                )}
                <Outlet />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </DndWrapper>
      </PaneLayoutProvider>
      </WorkspaceProvider>
    </AppContext.Provider>
  )
}

// ── Drag & Drop Wrapper ──────────────────────────────────────────────────────

function DndWrapper({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const layout = usePaneLayoutContext()
  const [draggingAgent, setDraggingAgent] = useState<{ id: string; title: string } | null>(null)
  const justDraggedRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { agentId?: string; title?: string } | undefined
    if (data?.agentId) {
      setDraggingAgent({ id: data.agentId, title: data.title ?? "Agent" })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingAgent(null)
    // Suppress the click that fires on pointer-up after a drag
    justDraggedRef.current = true
    setTimeout(() => { justDraggedRef.current = false }, 50)

    const { over, active } = event
    if (!over) return

    const agentId = (active.data.current as { agentId?: string })?.agentId
    if (!agentId) return

    const droppableId = over.id as string
    const position = (over.data.current as { position?: string })?.position
    if (!position) return

    const colonIdx = droppableId.lastIndexOf(":")
    if (colonIdx === -1) return
    const paneId = droppableId.slice(0, colonIdx)

    if (position === "center") {
      layout.replaceAgent(paneId, agentId)
    } else {
      const direction = (position === "left" || position === "right") ? "horizontal" : "vertical"
      layout.splitPane(paneId, direction, agentId, position as any)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <DndDraggingContext.Provider value={!!draggingAgent}>
      <DndJustDraggedContext.Provider value={justDraggedRef}>
        {children}
      </DndJustDraggedContext.Provider>
      </DndDraggingContext.Provider>
      <DragOverlay>
        {draggingAgent && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border shadow-lg text-[12px] font-medium text-foreground">
            {draggingAgent.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

