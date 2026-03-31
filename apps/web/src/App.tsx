import { useState, useEffect, useSyncExternalStore } from "react"
import { getTheme, type Theme } from "@/lib/theme"
import { toast, Toaster } from "sonner"
import { Sidebar } from "@/components/Sidebar"
import { ChatView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { SettingsPage } from "@/components/SettingsPage"
import { Onboarding } from "@/components/Onboarding"
import { PRView } from "@/components/PRView"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { useAgents, useAgent, connectBackgroundServer } from "@hive/shared"
import { useNotifications } from "@/hooks/useNotifications"
import { useStreamingAgentId } from "@/hooks/useStreamingAgentId"
import { useServers } from "@/hooks/useServers"
import { useWorkspace } from "@/hooks/useWorkspace"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref } from "@/lib/notificationPrefs"
import { mockPRs } from "@/data/mockReviews"
import { getFlag } from "@/lib/flags"

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
  const [onboardingDone, setOnboardingDone] = useState(false)

  const { servers, activeId, refresh: refreshServers } = useServers()
  const { data: agents = [] } = useAgents()

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
  const streamingAgentId = useStreamingAgentId()

  const prReviewEnabled = getFlag("prReview")

  const workspace = useWorkspace(agents)
  const { data: activeAgent, isStreaming: activeIsStreaming } = useAgent(workspace.resolvedActiveId)

  const selectedPr = prReviewEnabled && workspace.selectedPrId
    ? mockPRs.find((p) => p.id === workspace.selectedPrId) ?? null
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
  }

  // PR view
  if (selectedPr) {
    return (
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
        <Sidebar {...sidebarProps} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <PRView key={selectedPr.id} pr={selectedPr} />
        </div>
      </div>
    )
  }

  // No agent selected
  if (!activeAgent) {
    return (
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
        <Sidebar {...sidebarProps} />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {agents.length === 0 ? "No agents yet — create one to get started" : "Select an agent"}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
      <Sidebar {...sidebarProps} />

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0">
        <ResizablePanel defaultSize={60} minSize={30}>
          <ChatView
            agent={activeAgent}
            isStreaming={activeIsStreaming || streamingAgentId === workspace.resolvedActiveId}
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

        <ResizablePanel defaultSize={40} minSize={20}>
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={65} minSize={20}>
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

            <ResizablePanel defaultSize={35} minSize={15}>
              <TerminalView agent={activeAgent} activeTab={terminalTab} onTabChange={setTerminalTab} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
