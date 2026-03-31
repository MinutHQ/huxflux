import { useState, useEffect, useCallback, useSyncExternalStore } from "react"
import { getTheme, type Theme } from "@/lib/theme"
import { useQueryClient } from "@tanstack/react-query"
import { toast, Toaster } from "sonner"
import { Sidebar } from "@/components/Sidebar"
import { ChatView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { SettingsPage } from "@/components/SettingsPage"
import { Onboarding } from "@/components/Onboarding"
import { PRView } from "@/components/PRView"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { useAgents } from "@/hooks/useAgents"
import { useAgent } from "@/hooks/useAgent"
import { useNotifications } from "@/hooks/useNotifications"
import { useStreamingAgentId } from "@/hooks/useStreamingAgentId"
import { useServers } from "@/hooks/useServers"
import { connectBackgroundServer } from "@/lib/ws"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref } from "@/lib/notificationPrefs"
import type { FileChange, PRComment } from "@/data/mock"
type OpenFile = { type: "diff"; file: FileChange } | { type: "content"; path: string }
import { mockPRs } from "@/data/mockReviews"
import { getFlag } from "@/lib/flags"
import { api } from "@/lib/api"

interface ChatTab {
  agentId: string
  title: string
  isChild?: boolean // child tabs aren't in the sidebar agents list
}

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
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null)
  const [openFileTab, setOpenFileTab] = useState<OpenFile | null>(null)
  const [pendingComments, setPendingComments] = useState<PRComment[]>([])
  const [terminalTab, setTerminalTab] = useState<"setup" | "run" | "terminal">("terminal")
  const [onboardingDone, setOnboardingDone] = useState(false)

  // Multi-tab state
  const [tabs, setTabs] = useState<ChatTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const { servers, activeId, refresh: refreshServers } = useServers()

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

  const { data: agents = [] } = useAgents()
  useNotifications(agents)

  // Show onboarding if no servers configured
  if (servers.length === 0 && !onboardingDone) {
    return (
      <>
        <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
        <Onboarding onComplete={() => { refreshServers(); setOnboardingDone(true) }} />
      </>
    )
  }

  const prReviewEnabled = getFlag("prReview")

  // Resolve which agent is active
  const resolvedActiveId = activeTabId ?? (selectedPrId ? null : agents[0]?.id ?? null)
  const { data: agent, isStreaming } = useAgent(resolvedActiveId)
  const streamingAgentId = useStreamingAgentId()
  const queryClient = useQueryClient()

  const selectedPr = prReviewEnabled && selectedPrId ? mockPRs.find((p) => p.id === selectedPrId) ?? null : null

  // Sync tabs with agent data — update titles for sidebar agents, remove deleted ones
  useEffect(() => {
    const agentIds = new Set(agents.map(a => a.id))
    setTabs(prev => {
      const next = prev
        .filter(tab => tab.isChild || agentIds.has(tab.agentId))
        .map(tab => {
          const a = agents.find(ag => ag.id === tab.agentId)
          return a ? { ...tab, title: a.title } : tab
        })
      if (activeTabId && !next.some(t => t.agentId === activeTabId)) {
        if (next.length > 0) {
          setActiveTabId(next[next.length - 1].agentId)
        } else {
          setActiveTabId(null)
        }
        setOpenFileTab(null)
        setPendingComments([])
      }
      return next
    })
  }, [agents, activeTabId])

  function handleAgentSelect(id: string) {
    const a = agents.find(ag => ag.id === id)
    setTabs([{ agentId: id, title: a?.title ?? "Agent" }])
    setActiveTabId(id)
    setSelectedPrId(null)
    setOpenFileTab(null)
    setPendingComments([])
  }

  function handlePrSelect(id: string) {
    setSelectedPrId(id)
    setTabs([])
    setActiveTabId(null)
    setOpenFileTab(null)
  }

  function handleTabSelect(agentId: string) {
    setActiveTabId(agentId)
    setOpenFileTab(null)
    setPendingComments([])
  }

  function handleTabClose(agentId: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.agentId !== agentId)
      if (agentId === activeTabId && next.length > 0) {
        setActiveTabId(next[next.length - 1].agentId)
      } else if (next.length === 0) {
        setActiveTabId(null)
      }
      return next
    })
    setOpenFileTab(null)
  }

  const handleNewTab = useCallback(async () => {
    if (!agent) return
    const suffix = Math.random().toString(36).slice(2, 6)
    const title = `${agent.title}-${suffix}`
    try {
      const created = await api.createAgent({
        title,
        branch: agent.branch,
        model: agent.model,
        shareWorktreeWith: agent.id,
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      const newTab: ChatTab = { agentId: created.id, title: created.title, isChild: true }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(created.id)
      setOpenFileTab(null)
      setPendingComments([])
    } catch (err) {
      toast.error(`Failed to create tab: ${err instanceof Error ? err.message : "unknown"}`)
    }
  }, [agent, queryClient])

  function handleTabTitleChange(agentId: string, newTitle: string) {
    setTabs(prev => prev.map(t => t.agentId === agentId ? { ...t, title: newTitle } : t))
  }

  if (view === "settings") {
    return (
      <>
        <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
        <SettingsPage onBack={() => setView("app")} />
      </>
    )
  }

  // Resolve selectedId for sidebar highlight
  const sidebarSelectedId = tabs.length > 0 ? tabs[0].agentId : ""

  const sidebarProps = {
    agents,
    selectedId: sidebarSelectedId,
    streamingAgentId,
    onSelect: handleAgentSelect,
    onOpenSettings: () => setView("settings"),
    onAgentCreated: (id: string) => {
      const a = agents.find(ag => ag.id === id)
      setTabs([{ agentId: id, title: a?.title ?? "Agent" }])
      setActiveTabId(id)
      setSelectedPrId(null)
    },
    prs: prReviewEnabled ? mockPRs : [],
    selectedPrId,
    onSelectPr: handlePrSelect,
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
  if (!agent) {
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
            agent={agent}
            isStreaming={isStreaming || streamingAgentId === resolvedActiveId}
            openFileTab={openFileTab}
            onClearFileTab={() => setOpenFileTab(null)}
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
            onNewTab={handleNewTab}
            onTabTitleChange={handleTabTitleChange}
            pendingComments={pendingComments}
            onRemoveComment={(id: string) => setPendingComments((prev) => prev.filter((c) => c.id !== id))}
            onClearComments={() => setPendingComments([])}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={40} minSize={20}>
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={65} minSize={20}>
              <FileChangesView
                agent={agent}
                selectedFile={openFileTab?.type === "diff" ? openFileTab.file.path : null}
                onFileSelect={(file) => setOpenFileTab(file ? { type: "diff", file } : null)}
                onFileContentSelect={(path) => setOpenFileTab({ type: "content", path })}
                onAddComment={(c) => setPendingComments((prev) =>
                  prev.some((p) => p.id === c.id) ? prev : [...prev, c]
                )}
              />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={35} minSize={15}>
              <TerminalView agent={agent} activeTab={terminalTab} onTabChange={setTerminalTab} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
