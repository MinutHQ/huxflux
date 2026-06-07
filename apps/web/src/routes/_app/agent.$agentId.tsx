import { createRoute, useNavigate } from "@tanstack/react-router"
import { useState, useEffect, useRef, useMemo } from "react"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, Popover, PopoverTrigger, PopoverContent } from "@huxflux/ui"
import { IconDots, IconLayoutBottombar, IconLayoutSidebar } from "@tabler/icons-react"
import { ChatView } from "@/domains/chat/ChatView"
import { FileChangesView } from "@/domains/file-changes/FileChangesView"
import { FileViewerPanel } from "@/domains/file-changes/FileViewerPanel"
import { getDiffTheme } from "@/domains/file-changes/getDiffTheme"
import { AgentWorkspaceHeader } from "@/domains/agents/AgentWorkspaceHeader"
import { HomeView } from "@/domains/agents/HomeView"
import { TerminalView } from "@/domains/agents/TerminalView"
import { useAgentWorkspaceLayout } from "@/domains/agents/useAgentWorkspaceLayout"
import { useAgent, api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { toast } from "sonner"
import { WorkerPoolContextProvider } from "@pierre/diffs/react"
import { useWorkspaceContext } from "@/app-shell/workspace"
import { useAppContext } from "@/hooks/useAppContext"
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
  const { githubEnabled, sidebarCollapsed } = useAppContext()
  const layout = useAgentWorkspaceLayout(agentId)
  const {
    terminalTab, setTerminalTab,
    maximizedPane,
    setActiveRightPane,
    rightPanelVisible, setRightPanelVisible,
    terminalVisible,
    rightLayout,
  } = layout

  const fileViewerOpen = workspace.fileTabs.length > 0
  const [chatHiddenWhileFileOpen, setChatHiddenWhileFileOpen] = useState(false)
  // chatHidden only applies when the file viewer is open; once the viewer
  // closes the chat is always visible. Deriving instead of setting in an
  // effect avoids the cascading render that fires every time fileViewerOpen
  // toggles.
  const chatHidden = fileViewerOpen && chatHiddenWhileFileOpen
  const setChatHidden = setChatHiddenWhileFileOpen
  const [terminalPosition, setTerminalPosition] = useState<"right" | "bottom">(() => {
    return (localStorage.getItem("huxflux:terminal-position") as "right" | "bottom") || "right"
  })

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
  // workspace is unstable (re-created each render). Keying on agentId only is
  // intentional: we just want to react when the route param changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

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
  // Keyed on toolUseId only: title/questions update during the same question and
  // we don't want to re-fire the toast/notification when they change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePendingQuestion?.toolUseId])

  const terminalAgentId = workspace.rootAgentId
  // When the root agent IS the active agent (the common case, including a
  // freshly created agent), skip the separate query — `activeAgent` already
  // holds the same cache entry, and gating the terminal/files panels on a
  // second async result was causing a visible post-navigation lag.
  const sameAsActive = !!terminalAgentId && !!activeAgent && terminalAgentId === activeAgent.id
  const { data: terminalAgentQueryData } = useHuxfluxQuery({
    queryKey: queryKeys.agents.detail(terminalAgentId),
    queryFn: () => api.agents.get(terminalAgentId!),
    enabled: !!terminalAgentId && !sameAsActive,
    staleTime: 10_000,
  })
  const terminalAgentData = sameAsActive ? activeAgent : terminalAgentQueryData

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
      // fire-and-forget; intentional: one-off composite read for an event-driven review action
      // eslint-disable-next-line no-restricted-syntax
      const settings = await api.settings.current()

      // Fetch file changes and diffs for context
      const files = activeAgent.fileChanges ?? []
      let diffSection = ""
      if (files.length > 0) {
        const diffs = await Promise.all(
          files.map(async (f) => {
            try {
              // fire-and-forget; intentional: bulk diff read for the review prompt body
              // eslint-disable-next-line no-restricted-syntax
              const patch = await api.agents.diff(activeAgent!.id, f.path)
              return { path: f.path, additions: f.additions, deletions: f.deletions, patch }
            } catch {
              return { path: f.path, additions: f.additions, deletions: f.deletions, patch: "" }
            }
          })
        )
        diffSection = diffs.map((f) => {
          const header = `### ${f.path} (+${f.additions}/-${f.deletions})`
          return f.patch ? `${header}\n\`\`\`diff\n${f.patch}\n\`\`\`` : header
        }).join("\n\n")
      }

      const userPrompt = settings.reviewPrompt?.trim() || ""

      const prompt = [
        `Review the changes in this workspace.`,
        activeAgent.description ? `\nTask: ${activeAgent.description}` : "",
        files.length > 0 ? `\n## Changed files (${files.length})\n\n${diffSection}` : "\nNo file changes detected yet.",
        `\n## Instructions`,
        `Review the diff above for:`,
        `- **Bugs**: Logic errors, off-by-one, null/undefined access, race conditions, edge cases`,
        `- **Security**: Injection, auth bypass, secret leaks, unsafe input handling`,
        `- **Correctness**: Does the implementation match the task description? Are there missing cases?`,
        `- **Blast radius**: Do the changes break any existing callers or consumers?`,
        userPrompt ? `\n## Additional instructions\n\n${userPrompt}` : "",
        `\n## Output format`,
        `For each issue found, specify:`,
        `- **File and line** (or general if not file-specific)`,
        `- **Severity**: blocking (must fix), suggestion (should fix), nit (optional)`,
        `- **What's wrong and how to fix it**`,
        `\nEnd with an overall verdict: approve, request changes, or comment.`,
        `If no issues found, say so explicitly. Do not invent problems.`,
      ].filter(Boolean).join("\n")

      workspace.createTabWithMessage(activeAgent, prompt, { model: settings.reviewModel, provider: settings.reviewProvider })
    } catch {
      if (activeAgent) workspace.createTabWithMessage(activeAgent, "Review the changes you've made. Look for bugs, security issues, performance problems, and code quality. Be thorough but concise.")
    }
  }

  const terminalContent = terminalAgentData && (
    <TerminalView
      key={terminalAgentId!}
      agent={terminalAgentData}
      activeTab={terminalTab}
      onTabChange={setTerminalTab}
      onOpenSettings={() => navigate({ to: "/settings" })}
      onPortChange={() => {}}
    />
  )

  const terminalPanel = terminalContent && (
    <div className="relative h-full">
      <div className="absolute top-1 right-1 z-10">
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/50 transition-colors">
              <IconDots size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-40 p-1">
            <button
              onClick={() => {
                const next = terminalPosition === "right" ? "bottom" : "right"
                setTerminalPosition(next)
                localStorage.setItem("huxflux:terminal-position", next)
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-foreground hover:bg-accent rounded-md transition-colors"
            >
              {terminalPosition === "right" ? (
                <><IconLayoutBottombar size={14} className="text-muted-foreground" /> Move to bottom</>
              ) : (
                <><IconLayoutSidebar size={14} className="text-muted-foreground" /> Move to side</>
              )}
            </button>
          </PopoverContent>
        </Popover>
      </div>
      {terminalContent}
    </div>
  )

  const headerEl = (
    <AgentWorkspaceHeader
      agent={terminalAgentData ?? activeAgent}
      isStreaming={activeIsStreaming}
      githubEnabled={githubEnabled}
      onCreatePR={handleCreatePR}
      onReview={handleReview}
      onRun={handleRun}
      rightPanelVisible={rightPanelVisible}
      onToggleRightPanel={() => setRightPanelVisible((v) => !v)}
      sidebarCollapsed={sidebarCollapsed}
    />
  )

  return (
    <WorkerPoolContextProvider {...workerPoolOptions}>
    <div className="flex flex-col flex-1 min-w-0 h-full">

      {maximizedPane === "files" ? (
        <>
          {headerEl}
          <div className="flex-1 min-h-0 p-1.5 pt-0">
            <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden">
              <FileChangesView
                agent={terminalAgentData ?? activeAgent}
                selectedFile={workspace.openFileTab?.type === "diff" ? workspace.openFileTab.file.path : null}
                onFileSelect={(file) => file ? workspace.openFile({ type: "diff", file }) : workspace.closeAllFileTabs()}
                onFileContentSelect={(path) => workspace.openFile({ type: "content", path })}
                onAddComment={(c) => workspace.setPendingComments((prev) => prev.some((p) => p.id === c.id) ? prev : [...prev, c])}
                pendingComments={workspace.pendingComments}
                onRemoveComment={(id) => workspace.setPendingComments((prev) => prev.filter((c) => c.id !== id))}
                onOpenDiffBrowser={(scrollToPath) => workspace.openFile({ type: "changes", scrollToPath })}
                onOpenPRTab={() => workspace.openFile({ type: "pr" })}
              />
            </div>
          </div>
        </>
      ) : maximizedPane === "terminal" ? (
        <>
          {headerEl}
          <div className="flex-1 min-h-0 p-1.5 pt-0">
            <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden">
              {terminalPanel}
            </div>
          </div>
        </>
      ) : (
      <>
      {headerEl}
      <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0 gap-1 p-1 pt-0">
        <ResizablePanel defaultSize={terminalPosition === "bottom" && terminalVisible ? 70 : 100} minSize={30}>
          <ResizablePanelGroup key={`${fileViewerOpen ? "v" : "n"}-${chatHidden ? "h" : "s"}`} orientation="horizontal" className="h-full gap-1">
            {/* Chat panel */}
            {!chatHidden && <ResizablePanel defaultSize={fileViewerOpen ? 45 : 70} minSize="30">
              <div className="flex flex-col h-full rounded-xl bg-card border border-border/40 overflow-hidden">
                <ChatView
                  agent={activeAgent}
                  isStreaming={activeIsStreaming}
                  loadMore={activeLoadMore}
                  hasMore={activeHasMore}
                  isLoadingMore={activeIsLoadingMore}
                  openFileTab={null}
                  onClearFileTab={() => workspace.closeAllFileTabs()}
                  tabs={workspace.tabs}
                  activeTabId={workspace.activeTabId}
                  onTabSelect={workspace.selectTab}
                  onTabClose={workspace.closeTab}
                  onNewTab={() => activeAgent && workspace.createTab(activeAgent)}
                  onNewTabWithMessage={(msg) => activeAgent && workspace.createTabWithMessage(activeAgent, msg)}
                  onTabTitleChange={workspace.renameTab}
                  pendingComments={workspace.pendingComments}
                  onAddComment={(c) => workspace.setPendingComments((prev) => prev.some((p) => p.id === c.id) ? prev : [...prev, c])}
                  onOpenDiffFile={(file) => workspace.openFile({ type: "diff", file })}
                  onRemoveComment={(id: string) => workspace.setPendingComments((prev) => prev.filter((c) => c.id !== id))}
                  onClearComments={() => workspace.setPendingComments([])}
                  githubEnabled={githubEnabled}
                  pendingQuestion={activePendingQuestion}
                  onClearPendingQuestion={activeClearPendingQuestion}
                  hideHeader
                  initialMessage={workspace.queuedSetupMessage}
                  onConsumeInitialMessage={() => workspace.setQueuedSetupMessage(null)}
                  initialDraft={workspace.setupDraft || null}
                  onConsumeInitialDraft={() => workspace.setSetupDraft("")}
                />
              </div>
            </ResizablePanel>}
            {/* File viewer panel */}
            {fileViewerOpen && (
              <>
                {!chatHidden && <ResizableHandle className="w-0 bg-transparent" />}
                <ResizablePanel defaultSize={chatHidden ? 70 : 25} minSize="15">
                  <div className="flex flex-col h-full rounded-xl bg-card border border-border/40 overflow-hidden">
                    <FileViewerPanel
                      agentId={(terminalAgentData ?? activeAgent).id}
                      tabs={workspace.fileTabs}
                      activeTabId={workspace.activeFileTabId}
                      onSelectTab={workspace.selectFileTab}
                      onCloseTab={workspace.closeFileTab}
                      onCloseAll={workspace.closeAllFileTabs}
                      onMaximize={() => setChatHidden(h => !h)}
                      fileChanges={(terminalAgentData ?? activeAgent).fileChanges}
                      onAddComment={(c) => workspace.setPendingComments((prev) => prev.some((p) => p.id === c.id) ? prev : [...prev, c])}
                      pendingComments={workspace.pendingComments}
                      onRemoveComment={(id) => workspace.setPendingComments((prev) => prev.filter((c) => c.id !== id))}
                    />
                  </div>
                </ResizablePanel>
              </>
            )}
            {/* Right panel — file tree + terminal */}
            {rightPanelVisible && <ResizableHandle className="w-0 bg-transparent" />}
            {rightPanelVisible && <ResizablePanel defaultSize={30} minSize="20">
              {terminalPosition === "right" ? (
                <ResizablePanelGroup orientation="vertical" className="h-full gap-1" defaultLayout={rightLayout.defaultLayout} onLayoutChanged={rightLayout.onLayoutChanged}>
                  <ResizablePanel id="huxflux-right-files" defaultSize="50" minSize="20">
                    <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden" onPointerDown={() => setActiveRightPane("files")}>
                      <FileChangesView
                        agent={terminalAgentData ?? activeAgent}
                        selectedFile={workspace.openFileTab?.type === "diff" ? workspace.openFileTab.file.path : null}
                        onFileSelect={(file) => file ? workspace.openFile({ type: "diff", file }) : workspace.closeAllFileTabs()}
                        onFileContentSelect={(path) => workspace.openFile({ type: "content", path })}
                        onAddComment={(c) => workspace.setPendingComments((prev) => prev.some((p) => p.id === c.id) ? prev : [...prev, c])}
                        pendingComments={workspace.pendingComments}
                        onRemoveComment={(id) => workspace.setPendingComments((prev) => prev.filter((c) => c.id !== id))}
                        onOpenDiffBrowser={(scrollToPath) => workspace.openFile({ type: "changes", scrollToPath })}
                        onOpenPRTab={() => workspace.openFile({ type: "pr" })}
                        hideHeader
                      />
                    </div>
                  </ResizablePanel>
                  {terminalVisible && <ResizableHandle className="h-0 bg-transparent" />}
                  {terminalVisible && <ResizablePanel id="huxflux-right-terminal" defaultSize="50" minSize="15">
                    <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden" onPointerDown={() => setActiveRightPane("terminal")}>
                      {terminalPanel}
                    </div>
                  </ResizablePanel>}
                </ResizablePanelGroup>
              ) : (
                <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden" onPointerDown={() => setActiveRightPane("files")}>
                  <FileChangesView
                    agent={terminalAgentData ?? activeAgent}
                    selectedFile={workspace.openFileTab?.type === "diff" ? workspace.openFileTab.file.path : null}
                    onFileSelect={(file) => file ? workspace.openFile({ type: "diff", file }) : workspace.closeAllFileTabs()}
                    onFileContentSelect={(path) => workspace.openFile({ type: "content", path })}
                    onAddComment={(c) => workspace.setPendingComments((prev) => prev.some((p) => p.id === c.id) ? prev : [...prev, c])}
                    pendingComments={workspace.pendingComments}
                    onRemoveComment={(id) => workspace.setPendingComments((prev) => prev.filter((c) => c.id !== id))}
                    onOpenDiffBrowser={(scrollToPath) => workspace.openFile({ type: "changes", scrollToPath })}
                    onOpenPRTab={() => workspace.openFile({ type: "pr" })}
                    hideHeader
                  />
                </div>
              )}
            </ResizablePanel>}
          </ResizablePanelGroup>
        </ResizablePanel>
        {/* Terminal at bottom */}
        {terminalPosition === "bottom" && terminalVisible && (
          <>
            <ResizableHandle className="h-0 bg-transparent" />
            <ResizablePanel defaultSize={30} minSize={10}>
              <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden" onPointerDown={() => setActiveRightPane("terminal")}>
                {terminalPanel}
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      </>
      )}
    </div>
    </WorkerPoolContextProvider>
  )
}
