import { createRoute, useNavigate } from "@tanstack/react-router"
import { useState, useEffect, useRef } from "react"
import { useDefaultLayout } from "react-resizable-panels"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { ChatView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { HomeView } from "@/components/HomeView"
import { useAgent, api } from "@huxflux/shared"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext"
import { useAppContext } from "../_app"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "agent/$agentId",
  component: AgentRoute,
})

function AgentRoute() {
  const { agentId } = Route.useParams()
  const navigate = useNavigate()
  const workspace = useWorkspaceContext()
  const { githubEnabled } = useAppContext()
  const [terminalTab, setTerminalTab] = useState<"setup" | "run" | "terminal">("terminal")
  const [terminalMaximized, setTerminalMaximized] = useState(false)

  const mainLayout = useDefaultLayout({ id: "huxflux-main", panelIds: ["huxflux-main-chat", "huxflux-main-right"] })
  const rightLayout = useDefaultLayout({ id: "huxflux-right", panelIds: ["huxflux-right-files", "huxflux-right-terminal"] })

  // Sync workspace when agentId from URL changes
  const prevAgentIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (agentId && agentId !== prevAgentIdRef.current) {
      prevAgentIdRef.current = agentId
      workspace.selectAgent(agentId)
    }
  }, [agentId])

  // Listen for terminal maximize toggle from root keyboard shortcut
  useEffect(() => {
    function onToggle() { setTerminalMaximized((v) => !v) }
    window.addEventListener("huxflux:toggle-terminal-maximize", onToggle)
    return () => window.removeEventListener("huxflux:toggle-terminal-maximize", onToggle)
  }, [])

  const { data: activeAgent, isStreaming: activeIsStreaming, loadMore: activeLoadMore, hasMore: activeHasMore, isLoadingMore: activeIsLoadingMore, pendingQuestion: activePendingQuestion, clearPendingQuestion: activeClearPendingQuestion } = useAgent(workspace.resolvedActiveId)

  // Notify when an agent asks a question
  const prevQuestionRef = useRef<string | null>(null)
  useEffect(() => {
    const qId = activePendingQuestion?.toolUseId ?? null
    if (qId && qId !== prevQuestionRef.current) {
      const title = activeAgent?.title ?? "Agent"
      toast.info(`${title} is asking a question`, { description: activePendingQuestion?.questions[0]?.question })
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`${title} needs your input`, { body: activePendingQuestion?.questions[0]?.question })
      }
    }
    prevQuestionRef.current = qId
  }, [activePendingQuestion?.toolUseId])

  // Terminal is always keyed to the ROOT agent
  const terminalAgentId = workspace.rootAgentId
  const { data: terminalAgentData } = useQuery({
    queryKey: ["agent", terminalAgentId],
    queryFn: () => api.getAgent(terminalAgentId!),
    enabled: !!terminalAgentId,
    staleTime: 10_000,
  })

  if (!activeAgent) {
    return <HomeView />
  }

  const terminalPanel = terminalAgentData && (
    <TerminalView
      key={terminalAgentId!}
      agent={terminalAgentData}
      activeTab={terminalTab}
      onTabChange={setTerminalTab}
      onOpenSettings={() => navigate({ to: "/settings" })}
      onPortChange={() => {}}
    />
  )

  if (terminalMaximized) {
    return <div className="flex-1 min-w-0 h-full">{terminalPanel}</div>
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0" defaultLayout={mainLayout.defaultLayout} onLayoutChanged={mainLayout.onLayoutChanged}>
      <ResizablePanel id="huxflux-main-chat" defaultSize="72" minSize="30">
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
          onNewTabWithMessage={(msg) => activeAgent && workspace.createTabWithMessage(activeAgent, msg)}
          onTabTitleChange={workspace.renameTab}
          pendingComments={workspace.pendingComments}
          onRemoveComment={(id: string) => workspace.setPendingComments((prev) => prev.filter((c) => c.id !== id))}
          onClearComments={() => workspace.setPendingComments([])}
          githubEnabled={githubEnabled}
          pendingQuestion={activePendingQuestion}
          onClearPendingQuestion={activeClearPendingQuestion}
        />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id="huxflux-main-right" defaultSize="28" minSize="15">
        <ResizablePanelGroup orientation="vertical" defaultLayout={rightLayout.defaultLayout} onLayoutChanged={rightLayout.onLayoutChanged}>
          <ResizablePanel id="huxflux-right-files" defaultSize="50" minSize="20">
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

          <ResizablePanel id="huxflux-right-terminal" defaultSize="50" minSize="15">
            {terminalPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
