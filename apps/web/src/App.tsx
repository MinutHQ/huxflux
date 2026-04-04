import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react"
import { type PanelImperativeHandle, useDefaultLayout } from "react-resizable-panels"
import { getTheme, type Theme } from "@/lib/theme"
import { toast, Toaster } from "sonner"
import { Sidebar } from "@/components/Sidebar"
import { ChatView, SetupView, TeardownView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { SettingsPage } from "@/components/SettingsPage"
import { Onboarding } from "@/components/Onboarding"
import { PRView } from "@/components/PRView"
import { HomeView } from "@/components/HomeView"
import { RefineView, loadRefineSessions, saveRefineSessions, type RefineSession } from "@/components/RefineView"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@hive/ui"
import { useAgents, useAgent, connectBackgroundServer, parseConnectionString, getServers, setActiveServerId, addServer, useServerConfig, api } from "@hive/shared"
import { useQuery } from "@tanstack/react-query"
import { useNotifications } from "@/hooks/useNotifications"
import { useStreamingAgentId } from "@/hooks/useStreamingAgentId"
import { useServers } from "@/hooks/useServers"
import { useWorkspace } from "@/hooks/useWorkspace"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref } from "@/lib/notificationPrefs"
import { usePRs } from "@/hooks/usePRs"
import { getFlag } from "@/lib/flags"
import { isTauri } from "@/lib/platform"
import { useUpdater } from "@/hooks/useUpdater"
import { UpdateBanner } from "@/components/UpdateBanner"

function useCurrentTheme(): Theme {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("hive:theme-change", cb); return () => window.removeEventListener("hive:theme-change", cb) },
    getTheme,
    () => "dark"
  )
}

export default function App() {
  const theme = useCurrentTheme()
  const [view, setView] = useState<"app" | "settings">("app")
  const [terminalTab, setTerminalTab] = useState<"setup" | "run" | "terminal">("terminal")
  const [agentPorts, setAgentPorts] = useState<Record<string, number | null>>({})
  const [terminalMaximized, setTerminalMaximized] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [refineSessions, setRefineSessions] = useState<RefineSession[]>(() => loadRefineSessions())
  const [selectedRefineId, setSelectedRefineId] = useState<string | null>(null)
  const [showHome, setShowHome] = useState(false)

  const sidebarRef = useRef<PanelImperativeHandle>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const sidebarLayout = useDefaultLayout({ id: "hive-sidebar", panelIds: ["hive-sidebar-panel", "hive-content-panel"] })
  const mainLayout = useDefaultLayout({ id: "hive-main", panelIds: ["hive-main-chat", "hive-main-right"] })
  const rightLayout = useDefaultLayout({ id: "hive-right", panelIds: ["hive-right-files", "hive-right-terminal"] })

  const toggleSidebar = useCallback(() => {
    if (sidebarRef.current?.isCollapsed()) {
      sidebarRef.current.expand()
    } else {
      sidebarRef.current?.collapse()
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault()
        toggleSidebar()
      }
      if (e.key === "F1") {
        e.preventDefault()
        setTerminalMaximized((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleSidebar])

  const { update, isInstalling, progress, downloadAndInstall } = useUpdater()
  const { servers, activeId, refresh: refreshServers } = useServers()
  const { data: agents = [] } = useAgents()

  // Auto-register server from ?connect= URL param (e.g. opened via `huxflux open`)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connectParam = params.get("connect")
    if (!connectParam) return
    const parsed = parseConnectionString(connectParam)
    if (!parsed) return
    // Clean the URL without reloading
    params.delete("connect")
    const newSearch = params.toString()
    window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname)
    // Register if not already known
    const existing = getServers()
    const already = existing.find((s) => s.url === parsed.url)
    if (already) {
      setActiveServerId(already.id)
    } else {
      const server = addServer({ name: "My Server", url: parsed.url, token: parsed.token })
      setActiveServerId(server.id)
    }
    refreshServers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Background WS connections for non-active servers
  useEffect(() => {
    const backgroundServers = servers.filter((s) => s.id !== activeId)
    const cleanups = backgroundServers.map((server) => {
      const wsBase = server.url.replace(/^http/, "ws") + "/ws"
      const wsUrl = server.token ? `${wsBase}?token=${server.token}` : wsBase
      return connectBackgroundServer(wsUrl, (event) => {
        if (event.type !== "message:done") return
        toast.success(`Agent finished on ${server.name}`, {
          description: "Claude has completed its response.",
          duration: 4000,
        })
        if (getSoundEnabled()) playSound(getSoundPref())
      })
    })
    return () => { for (const cleanup of cleanups) cleanup() }
  }, [servers, activeId])

  useNotifications(agents)

  const prReviewEnabled = getFlag("prReview")
  const { githubEnabled, feedbackEnabled } = useServerConfig()
  const { prs, isLoading: prsLoading } = usePRs()
  const [reviewedPrIds, setReviewedPrIds] = useState<Set<string>>(new Set())
  const [userReviewedPrIds, setUserReviewedPrIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("hive:user-reviewed") ?? "[]")) }
    catch { return new Set() }
  })

  const workspace = useWorkspace(agents)
  const { data: activeAgent, isStreaming: activeIsStreaming, loadMore: activeLoadMore, hasMore: activeHasMore, isLoadingMore: activeIsLoadingMore } = useAgent(workspace.resolvedActiveId)

  // Terminal is always keyed to the ROOT agent (not the active chat session).
  // rootAgentId is explicitly maintained in useWorkspace and never changes when
  // switching between child chat sessions — only when selecting a different root
  // agent or creating a new one. Using plain useQuery (no placeholderData) so
  // the terminal never briefly renders with a stale/wrong agent.
  const terminalAgentId = workspace.rootAgentId
  const { data: terminalAgentData } = useQuery({
    queryKey: ["agent", terminalAgentId],
    queryFn: () => api.getAgent(terminalAgentId!),
    enabled: !!terminalAgentId,
    staleTime: 10_000,
  })

  const lastMsgs = activeAgent?.messages
  const lastMsgDurationMs = lastMsgs?.length ? (lastMsgs[lastMsgs.length - 1].durationMs ?? null) : null
  const streamingAgentId = useStreamingAgentId(lastMsgDurationMs)

  const selectedPr = prReviewEnabled && workspace.selectedPrId
    ? prs.find((p) => p.id === workspace.selectedPrId) ?? null
    : null

  // Show onboarding if no servers configured
  if (servers.length === 0 && !onboardingDone) {
    return (
      <>
        <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
        <Onboarding onComplete={() => { refreshServers(); setOnboardingDone(true) }} />
</>
    )
  }

  if (view === "settings") {
    return (
      <>
        <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
        <SettingsPage onBack={() => setView("app")} />
      </>
    )
  }

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
    setSelectedRefineId(id)
  }

  const sidebarProps = {
    agents,
    selectedId: workspace.sidebarSelectedId,
    streamingAgentId,
    onSelect: (id: string) => { setShowHome(false); workspace.selectAgent(id) },
    onOpenSettings: () => setView("settings"),
    onAgentCreating: workspace.onAgentCreating,
    onAgentCreated: workspace.onAgentCreated,
    clearPendingAgent: workspace.clearPendingAgent,
    pendingAgent: workspace.pendingAgent,
    onAgentDeleting: workspace.onAgentDeleting,
    clearDeletingAgent: workspace.clearDeletingAgent,
    prs: prReviewEnabled ? prs.map((p) => ({
      ...p,
      reviewReady: reviewedPrIds.has(p.id) || !!(p.repoId && localStorage.getItem(`hive:review:${p.repoId}:${p.number}`)),
      userReviewed: p.userReviewed || userReviewedPrIds.has(p.id),
    })) : [],
    selectedPrId: workspace.selectedPrId,
    onSelectPr: (id: string) => { setShowHome(false); workspace.selectPr(id) },
    onSwitchToAgents: workspace.switchToAgentView,
    onSwitchToReview: workspace.switchToReviewView,
    prsLoading,
    refineSessions,
    selectedRefineId,
    onSelectRefine: (id: string) => { setShowHome(false); setSelectedRefineId(id) },
    onNewRefine: handleNewRefine,
    agentPorts,
    onHome: () => setShowHome(true),
    showHome,
    onToggle: toggleSidebar,
    feedbackEnabled,
  }

  // key={terminalAgentId} ensures TerminalView is a distinct instance per root
  // agent, preventing stale session state when switching between agents whose
  // data is already cached (no null interlude to force a remount).
  // globalSessions (module-level) preserves terminal divs & WS across remounts.
  const terminalPanel = terminalAgentData && (
    <TerminalView
      key={terminalAgentId!}
      agent={terminalAgentData}
      activeTab={terminalTab}
      onTabChange={setTerminalTab}
      onOpenSettings={() => setView("settings")}
      onPortChange={(agentId, port) => setAgentPorts((prev) => ({ ...prev, [agentId]: port }))}
    />
  )

  const mainContent = showHome ? (
    <HomeView />
  ) : selectedRefineId ? (
    <div className="flex-1 min-w-0 h-full overflow-hidden flex">
      <RefineView
        sessionId={selectedRefineId}
        sessions={refineSessions}
        onSessionsChange={(next) => { setRefineSessions(next); saveRefineSessions(next) }}
      />
    </div>
  ) : selectedPr ? (
    <div className="flex-1 min-w-0 overflow-hidden">
      <PRView
        key={selectedPr.id}
        pr={selectedPr}
        onReviewDone={() => setReviewedPrIds((prev) => new Set([...prev, selectedPr.id]))}
        onUserReviewed={() => {
          const next = new Set([...userReviewedPrIds, selectedPr.id])
          setUserReviewedPrIds(next)
          localStorage.setItem("hive:user-reviewed", JSON.stringify([...next]))
        }}
      />
    </div>
  ) : workspace.deletingAgent ? (
    <div className="flex-1 min-w-0 overflow-hidden">
      <TeardownView deleting={workspace.deletingAgent} />
    </div>
  ) : workspace.pendingAgent ? (
    <div className="flex-1 min-w-0 overflow-hidden">
      <SetupView pending={workspace.pendingAgent} />
    </div>
  ) : !workspace.resolvedActiveId || !activeAgent ? (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      {agents.length === 0 ? "No agents yet — create one to get started" : "Select an agent"}
    </div>
  ) : terminalMaximized ? (
    <div className="flex-1 min-w-0 h-full">
      {terminalPanel}
    </div>
  ) : (
    <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0" defaultLayout={mainLayout.defaultLayout} onLayoutChanged={mainLayout.onLayoutChanged}>
      <ResizablePanel id="hive-main-chat" order={1} defaultSize="72" minSize="30">
        <ChatView
          agent={activeAgent}
          isStreaming={activeIsStreaming}
          loadMore={activeLoadMore}
          hasMore={activeHasMore}
          isLoadingMore={activeIsLoadingMore}
          openFileTab={workspace.openFileTab}
          onClearFileTab={() => workspace.setOpenFileTab(null)}
          tabs={workspace.tabs}
          activeTabId={workspace.activeTabId}
          onTabSelect={workspace.selectTab}
          onTabClose={workspace.closeTab}
          onNewTab={() => activeAgent && workspace.createTab(activeAgent)}
          onTabTitleChange={workspace.renameTab}
          pendingComments={workspace.pendingComments}
          onRemoveComment={(id: string) => workspace.setPendingComments((prev) => prev.filter((c) => c.id !== id))}
          onClearComments={() => workspace.setPendingComments([])}
          githubEnabled={githubEnabled}
        />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id="hive-main-right" order={2} defaultSize="28" minSize="15">
        <ResizablePanelGroup orientation="vertical" defaultLayout={rightLayout.defaultLayout} onLayoutChanged={rightLayout.onLayoutChanged}>
          <ResizablePanel id="hive-right-files" order={1} defaultSize="50" minSize="20">
            <FileChangesView
              agent={activeAgent}
              selectedFile={workspace.openFileTab?.type === "diff" ? workspace.openFileTab.file.path : null}
              onFileSelect={(file) => workspace.setOpenFileTab(file ? { type: "diff", file } : null)}
              onFileContentSelect={(path) => workspace.setOpenFileTab({ type: "content", path })}
              onAddComment={(c) => workspace.setPendingComments((prev) =>
                prev.some((p) => p.id === c.id) ? prev : [...prev, c]
              )}
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="hive-right-terminal" order={2} defaultSize="50" minSize="15">
            {terminalPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  )

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden flex flex-col">
      <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
      {isTauri && update && (
        <UpdateBanner
          update={update}
          isInstalling={isInstalling}
          progress={progress}
          isIdle={!streamingAgentId && agents.every((a) => a.status !== "in-progress")}
          onInstall={downloadAndInstall}
        />
      )}

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 w-full" defaultLayout={sidebarLayout.defaultLayout} onLayoutChanged={sidebarLayout.onLayoutChanged}>
        <ResizablePanel
          id="hive-sidebar-panel"
          order={1}
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

        <ResizableHandle />

        <ResizablePanel id="hive-content-panel" order={2} defaultSize="82" minSize="50" className="flex min-w-0 relative">
          {/* Expand button shown when sidebar is collapsed */}
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
          {mainContent}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
