import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react"
import { type PanelImperativeHandle } from "react-resizable-panels"
import { getTheme, type Theme } from "@/lib/theme"
import { toast, Toaster } from "sonner"
import { Sidebar } from "@/components/Sidebar"
import { ChatView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { SettingsPage } from "@/components/SettingsPage"
import { Onboarding } from "@/components/Onboarding"
import { PRView } from "@/components/PRView"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@hive/ui"
import { useAgents, useAgent, connectBackgroundServer, parseConnectionString, getServers, setActiveServerId, addServer } from "@hive/shared"
import { useQueryClient } from "@tanstack/react-query"
import { useNotifications } from "@/hooks/useNotifications"
import { useStreamingAgentId } from "@/hooks/useStreamingAgentId"
import { useServers } from "@/hooks/useServers"
import { useWorkspace } from "@/hooks/useWorkspace"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref } from "@/lib/notificationPrefs"
import { mockPRs } from "@/data/mockReviews"
import { getFlag } from "@/lib/flags"
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
  const { update, isInstalling, progress, downloadAndInstall } = useUpdater()
  const [view, setView] = useState<"app" | "settings">("app")
  const [terminalTab, setTerminalTab] = useState<"setup" | "run" | "terminal">("terminal")
  const [agentPorts, setAgentPorts] = useState<Record<string, number | null>>({})
  const [onboardingDone, setOnboardingDone] = useState(false)

  const sidebarRef = useRef<PanelImperativeHandle>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleSidebar])

  const queryClient = useQueryClient()
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

  const workspace = useWorkspace(agents)
  const { data: activeAgent, isStreaming: activeIsStreaming } = useAgent(workspace.resolvedActiveId)

  const lastMsgs = activeAgent?.messages
  const lastMsgDurationMs = lastMsgs?.length ? (lastMsgs[lastMsgs.length - 1].durationMs ?? null) : null
  const streamingAgentId = useStreamingAgentId(lastMsgDurationMs)

  const selectedPr = prReviewEnabled && workspace.selectedPrId
    ? mockPRs.find((p) => p.id === workspace.selectedPrId) ?? null
    : null

  // Show onboarding if no servers configured
  if (servers.length === 0 && !onboardingDone) {
    return (
      <>
        <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
        <Onboarding onComplete={() => {
          refreshServers()
          setOnboardingDone(true)
          void queryClient.invalidateQueries()
        }} />
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

  const sidebarProps = {
    agents,
    selectedId: workspace.sidebarSelectedId,
    streamingAgentId,
    onSelect: workspace.selectAgent,
    onOpenSettings: () => setView("settings"),
    onAgentCreated: workspace.onAgentCreated,
    prs: prReviewEnabled ? mockPRs : [],
    selectedPrId: workspace.selectedPrId,
    onSelectPr: workspace.selectPr,
    agentPorts,
    onToggle: toggleSidebar,
  }

  const mainContent = selectedPr ? (
    <div className="flex-1 min-w-0 overflow-hidden">
      <PRView key={selectedPr.id} pr={selectedPr} />
    </div>
  ) : !activeAgent ? (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      {agents.length === 0 ? "No agents yet — create one to get started" : "Select an agent"}
    </div>
  ) : (
    <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0">
      <ResizablePanel defaultSize="60" minSize="30">
        <ChatView
          agent={activeAgent}
          isStreaming={activeIsStreaming}
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
        />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize="40" minSize="20">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize="65" minSize="20">
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

          <ResizablePanel defaultSize="35" minSize="15">
            <TerminalView
              agent={activeAgent}
              activeTab={terminalTab}
              onTabChange={setTerminalTab}
              onOpenSettings={() => setView("settings")}
              onPortChange={(agentId, port) => setAgentPorts((prev) => ({ ...prev, [agentId]: port }))}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  )

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden flex flex-col">
      <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
      {update && (
        <UpdateBanner
          update={update}
          isInstalling={isInstalling}
          progress={progress}
          onInstall={downloadAndInstall}
        />
      )}

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 w-full">
        <ResizablePanel
          panelRef={sidebarRef}
          defaultSize="16"
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

        <ResizablePanel defaultSize="84" minSize="50" className="flex min-w-0 relative">
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
