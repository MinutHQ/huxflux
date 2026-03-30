import { useState, useEffect } from "react"
import { toast, Toaster } from "sonner"
import { Sidebar } from "@/components/Sidebar"
import { ChatView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { SettingsPage } from "@/components/SettingsPage"
import { Onboarding } from "@/components/Onboarding"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { useAgents } from "@/hooks/useAgents"
import { useAgent } from "@/hooks/useAgent"
import { useNotifications } from "@/hooks/useNotifications"
import { useStreamingAgentId } from "@/hooks/useStreamingAgentId"
import { useServers } from "@/hooks/useServers"
import { connectBackgroundServer } from "@/lib/ws"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref } from "@/lib/notificationPrefs"
import type { FileChange } from "@/data/mock"

export default function App() {
  const [view, setView] = useState<"app" | "settings">("app")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openFileTab, setOpenFileTab] = useState<FileChange | null>(null)
  const [terminalTab, setTerminalTab] = useState<"setup" | "run" | "terminal">("terminal")
  const [onboardingDone, setOnboardingDone] = useState(false)

  const { servers, activeId, refresh: refreshServers } = useServers()

  // Background WS connections for non-active servers
  useEffect(() => {
    const backgroundServers = servers.filter((s) => s.id !== activeId)
    const cleanups = backgroundServers.map((server) => {
      const wsUrl = server.url.replace(/^http/, "ws") + "/ws"
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
        <Toaster theme="dark" position="bottom-right" />
        <Onboarding onComplete={() => { refreshServers(); setOnboardingDone(true) }} />
      </>
    )
  }

  const resolvedSelectedId = selectedId ?? agents[0]?.id ?? null
  const { data: agent, isStreaming } = useAgent(resolvedSelectedId)
  const streamingAgentId = useStreamingAgentId()

  function handleAgentSelect(id: string) {
    setSelectedId(id)
    setOpenFileTab(null)
  }

  if (view === "settings") {
    return (
      <>
        <Toaster theme="dark" position="bottom-right" />
        <SettingsPage onBack={() => setView("app")} />
      </>
    )
  }

  if (!agent) {
    return (
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Toaster theme="dark" position="bottom-right" />
        <Sidebar
          agents={agents}
          selectedId={resolvedSelectedId ?? ""}
          streamingAgentId={streamingAgentId}
          onSelect={handleAgentSelect}
          onOpenSettings={() => setView("settings")}
          onAgentCreated={(id) => setSelectedId(id)}
        />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {agents.length === 0 ? "No agents yet — create one to get started" : "Select an agent"}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Toaster theme="dark" position="bottom-right" />
      <Sidebar
        agents={agents}
        selectedId={resolvedSelectedId ?? ""}
        streamingAgentId={streamingAgentId}
        onSelect={handleAgentSelect}
        onOpenSettings={() => setView("settings")}
        onAgentCreated={(id) => setSelectedId(id)}
      />

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0">
        <ResizablePanel defaultSize={60} minSize={30}>
          <ChatView
            agent={agent}
            isStreaming={isStreaming || streamingAgentId === resolvedSelectedId}
            openFileTab={openFileTab}
            onClearFileTab={() => setOpenFileTab(null)}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={40} minSize={20}>
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={65} minSize={20}>
              <FileChangesView
                agent={agent}
                selectedFile={openFileTab?.path ?? null}
                onFileSelect={setOpenFileTab}
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
