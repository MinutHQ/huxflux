import { createRoute, useNavigate } from "@tanstack/react-router"
import { useState, useEffect, useRef, useMemo } from "react"
import { useDefaultLayout } from "react-resizable-panels"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { ChatView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { HomeView } from "@/components/HomeView"
import { AgentWorkspaceHeader } from "@/components/AgentWorkspaceHeader"
import { useAgent, api } from "@huxflux/shared"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { WorkerPoolContextProvider } from "@pierre/diffs/react"
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext"
import { useAppContext } from "@/hooks/useAppContext"
import { getDiffTheme } from "@/components/DiffView"
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
  const [rightPanelVisible, setRightPanelVisible] = useState(true)
  const [terminalVisible, setTerminalVisible] = useState(true)

  const mainLayout = useDefaultLayout({ id: "huxflux-main", panelIds: ["huxflux-main-chat", "huxflux-main-right"] })
  const rightLayout = useDefaultLayout({ id: "huxflux-right", panelIds: ["huxflux-right-files", "huxflux-right-terminal"] })

  const workerPoolOptions = useMemo(() => ({
    poolOptions: {
      workerFactory: () => new Worker(
        new URL("@pierre/diffs/worker/worker.js", import.meta.url),
        { type: "module" }
      ),
    },
    highlighterOptions: {
      theme: getDiffTheme(),
      lineDiffType: "word" as const,
    },
  }), [])

  const prevAgentIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (agentId && agentId !== prevAgentIdRef.current) {
      prevAgentIdRef.current = agentId
      workspace.selectAgent(agentId)
    }
  }, [agentId])

  useEffect(() => {
    function onToggle() { setTerminalMaximized((v) => !v) }
    window.addEventListener("huxflux:toggle-terminal-maximize", onToggle)
    return () => window.removeEventListener("huxflux:toggle-terminal-maximize", onToggle)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "u") {
        e.preventDefault()
        setRightPanelVisible((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault()
        setTerminalVisible((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const { data: activeAgent, isStreaming: activeIsStreaming, loadMore: activeLoadMore, hasMore: activeHasMore, isLoadingMore: activeIsLoadingMore, pendingQuestion: activePendingQuestion, clearPendingQuestion: activeClearPendingQuestion } = useAgent(workspace.resolvedActiveId)

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

  const terminalAgentId = workspace.rootAgentId
  const { data: terminalAgentData } = useQuery({
    queryKey: ["agent", terminalAgentId],
    queryFn: () => api.getAgent(terminalAgentId!),
    enabled: !!terminalAgentId,
    staleTime: 10_000,
  })

  if (!activeAgent) return <HomeView />

  function handleCreatePR() {
    window.dispatchEvent(new CustomEvent("huxflux:send-message", { detail: { content: "Please create a pull request for the changes you've made. Write a clear title and description." } }))
  }

  function handleRun() {
    window.dispatchEvent(new CustomEvent("huxflux:run-script"))
  }

  async function handleReview() {
    if (!activeAgent) return
    try {
      const settings = await api.getSettings()
      const prompt = settings.reviewPrompt?.trim() || "Review the changes you've made. Look for bugs, security issues, performance problems, and code quality. Be thorough but concise."
      workspace.createTabWithMessage(activeAgent, prompt, { model: settings.reviewModel, provider: settings.reviewProvider })
    } catch {
      if (activeAgent) workspace.createTabWithMessage(activeAgent, "Review the changes you've made. Look for bugs, security issues, performance problems, and code quality. Be thorough but concise.")
    }
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

  if (terminalMaximized) return <div className="flex-1 min-w-0 h-full">{terminalPanel}</div>

  return (
    <WorkerPoolContextProvider {...workerPoolOptions}>
    <div className="flex flex-col flex-1 min-w-0 h-full">
      <AgentWorkspaceHeader
        agent={terminalAgentData ?? activeAgent}
        isStreaming={activeIsStreaming}
        githubEnabled={githubEnabled}
        onCreatePR={handleCreatePR}
        onReview={handleReview}
        onRun={handleRun}
        rightPanelVisible={rightPanelVisible}
        onToggleRightPanel={() => setRightPanelVisible((v) => !v)}
      />
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0" defaultLayout={mainLayout.defaultLayout} onLayoutChanged={mainLayout.onLayoutChanged}>
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
            hideHeader
            initialMessage={workspace.queuedSetupMessage}
            onConsumeInitialMessage={() => workspace.setQueuedSetupMessage(null)}
          />
        </ResizablePanel>
        {rightPanelVisible && <ResizableHandle className="w-0 bg-transparent" />}
        {rightPanelVisible && <ResizablePanel id="huxflux-main-right" defaultSize="30" minSize="20">
          <ResizablePanelGroup orientation="vertical" className="gap-1.5 p-1.5 pl-0" defaultLayout={rightLayout.defaultLayout} onLayoutChanged={rightLayout.onLayoutChanged}>
            <ResizablePanel id="huxflux-right-files" defaultSize="50" minSize="20">
              <div className="h-full rounded-lg border border-border/50 bg-background overflow-hidden">
                <FileChangesView
                  agent={terminalAgentData ?? activeAgent}
                  selectedFile={workspace.openFileTab?.type === "diff" ? workspace.openFileTab.file.path : null}
                  onFileSelect={(file) => workspace.setOpenFileTab(file ? { type: "diff", file } : null)}
                  onFileContentSelect={(path) => workspace.setOpenFileTab({ type: "content", path })}
                  onAddComment={(c) => workspace.setPendingComments((prev) => prev.some((p) => p.id === c.id) ? prev : [...prev, c])}
                  onOpenDiffBrowser={() => workspace.setOpenFileTab({ type: "diff-browser" })}
                  onOpenPRTab={() => workspace.setOpenFileTab({ type: "pr" })}
                  hideHeader
                />
              </div>
            </ResizablePanel>
            {terminalVisible && <ResizableHandle className="h-0 bg-transparent" />}
            {terminalVisible && <ResizablePanel id="huxflux-right-terminal" defaultSize="50" minSize="15">
              <div className="h-full rounded-lg border border-border/50 bg-background overflow-hidden">
                {terminalPanel}
              </div>
            </ResizablePanel>}
          </ResizablePanelGroup>
        </ResizablePanel>}
      </ResizablePanelGroup>
    </div>
    </WorkerPoolContextProvider>
  )
}
