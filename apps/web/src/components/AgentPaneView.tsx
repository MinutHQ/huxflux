import { useState, useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useDefaultLayout } from "react-resizable-panels"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, cn } from "@huxflux/ui"
import { ChatView } from "@/components/ChatView"
import { FileChangesView } from "@/components/FileChangesView"
import { TerminalView } from "@/components/TerminalView"
import { AgentWorkspaceHeader } from "@/components/AgentWorkspaceHeader"
import { useAgent, api } from "@huxflux/shared"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { PaneWorkspaceProvider, usePaneWorkspaceContext } from "@/hooks/usePaneWorkspaceContext"
import { useAppContext } from "@/hooks/useAppContext"

interface AgentPaneViewProps {
  agentId: string
  paneId: string
  isFocused: boolean
  onFocus: () => void
  onClose?: () => void
  showCloseButton?: boolean
}

export function AgentPaneView({ agentId, paneId, isFocused, onFocus, onClose, showCloseButton }: AgentPaneViewProps) {
  return (
    <PaneWorkspaceProvider agentId={agentId}>
      <AgentPaneViewInner
        agentId={agentId}
        paneId={paneId}
        isFocused={isFocused}
        onFocus={onFocus}
        onClose={onClose}
        showCloseButton={showCloseButton}
      />
    </PaneWorkspaceProvider>
  )
}

function AgentPaneViewInner({ agentId, paneId, isFocused, onFocus, onClose, showCloseButton }: AgentPaneViewProps) {
  const navigate = useNavigate()
  const workspace = usePaneWorkspaceContext()
  const { githubEnabled } = useAppContext()
  const [terminalTab, setTerminalTab] = useState<"setup" | "run" | "terminal">("terminal")
  const [terminalMaximized, setTerminalMaximized] = useState(false)
  const [rightPanelVisible, setRightPanelVisible] = useState(true)
  const [terminalVisible, setTerminalVisible] = useState(true)

  const mainLayout = useDefaultLayout({ id: `huxflux-main-${paneId}`, panelIds: [`huxflux-main-chat-${paneId}`, `huxflux-main-right-${paneId}`] })
  const rightLayout = useDefaultLayout({ id: `huxflux-right-${paneId}`, panelIds: [`huxflux-right-files-${paneId}`, `huxflux-right-terminal-${paneId}`] })

  // Keyboard shortcuts — only when focused
  useEffect(() => {
    if (!isFocused) return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "u") {
        e.preventDefault()
        setRightPanelVisible(v => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault()
        setTerminalVisible(v => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "w") {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isFocused, onClose])

  useEffect(() => {
    function onToggle() { setTerminalMaximized(v => !v) }
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

  const terminalAgentId = workspace.rootAgentId
  const { data: terminalAgentData } = useQuery({
    queryKey: ["agent", terminalAgentId],
    queryFn: () => api.getAgent(terminalAgentId!),
    enabled: !!terminalAgentId,
    staleTime: 10_000,
  })

  if (!activeAgent) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-xs">Loading...</div>
  }

  function handleCreatePR() {
    const msg = "Please create a pull request for the changes you've made. Write a clear title and description."
    window.dispatchEvent(new CustomEvent("huxflux:send-message", { detail: { content: msg } }))
  }

  async function handleReview() {
    if (!activeAgent) return
    try {
      const settings = await api.getSettings()
      const prompt = settings.reviewPrompt?.trim()
        || "Review the changes you've made. Look for bugs, security issues, performance problems, and code quality. Be thorough but concise."
      workspace.createTabWithMessage(activeAgent, prompt, {
        model: settings.reviewModel,
        provider: settings.reviewProvider,
      })
    } catch {
      if (activeAgent) workspace.createTabWithMessage(activeAgent, "Review the changes you've made. Look for bugs, security issues, performance problems, and code quality. Be thorough but concise.")
    }
  }

  function handleRun() {
    window.dispatchEvent(new CustomEvent("huxflux:run-script"))
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
    return <div className="flex-1 min-w-0 h-full" onMouseDown={onFocus}>{terminalPanel}</div>
  }

  return (
    <div
      className={cn("flex flex-col flex-1 min-w-0 h-full", isFocused && "ring-1 ring-primary/20 rounded-sm")}
      onMouseDown={onFocus}
    >
      <AgentWorkspaceHeader
        agent={terminalAgentData ?? activeAgent}
        isStreaming={activeIsStreaming}
        githubEnabled={githubEnabled}
        onCreatePR={handleCreatePR}
        onReview={handleReview}
        onRun={handleRun}
        rightPanelVisible={rightPanelVisible}
        onToggleRightPanel={() => setRightPanelVisible(v => !v)}
      />

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0" defaultLayout={mainLayout.defaultLayout} onLayoutChanged={mainLayout.onLayoutChanged}>
        <ResizablePanel id={`huxflux-main-chat-${paneId}`} defaultSize="72" minSize="30">
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
            onRemoveComment={(id: string) => workspace.setPendingComments(prev => prev.filter(c => c.id !== id))}
            onClearComments={() => workspace.setPendingComments([])}
            githubEnabled={githubEnabled}
            pendingQuestion={activePendingQuestion}
            onClearPendingQuestion={activeClearPendingQuestion}
            hideHeader
          />
        </ResizablePanel>

        {rightPanelVisible && <ResizableHandle className="w-0 bg-transparent" />}

        {rightPanelVisible && <ResizablePanel id={`huxflux-main-right-${paneId}`} defaultSize="28" minSize="15">
          <ResizablePanelGroup orientation="vertical" className="gap-1.5 p-1.5 pl-0" defaultLayout={rightLayout.defaultLayout} onLayoutChanged={rightLayout.onLayoutChanged}>
            <ResizablePanel id={`huxflux-right-files-${paneId}`} defaultSize="50" minSize="20">
              <div className="h-full rounded-lg border border-border/50 bg-background overflow-hidden">
                <FileChangesView
                  agent={terminalAgentData ?? activeAgent}
                  selectedFile={workspace.openFileTab?.type === "diff" ? workspace.openFileTab.file.path : null}
                  onFileSelect={(file) => workspace.setOpenFileTab(file ? { type: "diff", file } : null)}
                  onFileContentSelect={(path) => workspace.setOpenFileTab({ type: "content", path })}
                  onAddComment={(c) => workspace.setPendingComments(prev =>
                    prev.some(p => p.id === c.id) ? prev : [...prev, c]
                  )}
                  onOpenDiffBrowser={() => workspace.setOpenFileTab({ type: "diff-browser" })}
                  onOpenPRTab={() => workspace.setOpenFileTab({ type: "pr" })}
                  hideHeader
                />
              </div>
            </ResizablePanel>

            {terminalVisible && <ResizableHandle className="h-0 bg-transparent" />}

            {terminalVisible && <ResizablePanel id={`huxflux-right-terminal-${paneId}`} defaultSize="50" minSize="15">
              <div className="h-full rounded-lg border border-border/50 bg-background overflow-hidden">
                {terminalPanel}
              </div>
            </ResizablePanel>}
          </ResizablePanelGroup>
        </ResizablePanel>}
      </ResizablePanelGroup>
    </div>
  )
}
