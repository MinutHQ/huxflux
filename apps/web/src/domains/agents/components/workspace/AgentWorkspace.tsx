import { useEffect, useMemo, useRef, useState } from "react"
import { WorkerPoolContextProvider } from "@pierre/diffs/react"
import { useAgent, api, queryKeys, useHuxfluxQuery, useRepos, type FileChange, type PRComment } from "@huxflux/shared"
import { ChatView } from "@/domains/chat/ChatView"
import { getDiffTheme } from "@/domains/file-changes/getDiffTheme"
import { useFileBuffers } from "@/domains/file-changes/useFileBuffers"
import { useWorkspaceContext } from "@/app-shell/workspace"
import { useAppContext } from "@/hooks/useAppContext"
import { AgentWorkspaceHeader } from "../AgentWorkspaceHeader"
import { HomeView } from "../../HomeView"
import { useAgentWorkspaceLayout } from "../../hooks/useAgentWorkspaceLayout"
import { isGitRepo } from "../../utils"
import type { SidePaneId } from "../../agents.types"
import { useQuestionNotice, useWorkspaceActions } from "../../hooks/useWorkspaceActions"
import { SideTopSection, type PaneRequests } from "./SideTopSection"
import { WorkspaceDock } from "./WorkspaceDock"
import { WorkspaceTerminal } from "./WorkspaceTerminal"

const workerPoolOptions = {
  poolOptions: {
    workerFactory: () => new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), { type: "module" }),
  },
  highlighterOptions: { theme: getDiffTheme(), lineDiffType: "word" as const },
}

/**
 * The per-agent workspace: header over a dock of panes (chat, Diff, Files,
 * PR, terminal) that can be dragged into splits and tab groups. Any pane can
 * be maximized; every pane but the chat can be closed.
 */
export function AgentWorkspace({ agentId }: { agentId: string }) {
  const workspace = useWorkspaceContext()
  const { githubEnabled, sidebarCollapsed } = useAppContext()
  const buffers = useFileBuffers(agentId, workspace.fileDraftsFor(agentId))
  const [requests, setRequests] = useState<PaneRequests>({ diffFocus: null, fileOpen: null })

  const prevAgentId = useRef<string | null>(null)
  useEffect(() => {
    if (agentId !== prevAgentId.current) {
      prevAgentId.current = agentId
      workspace.selectAgent(agentId)
    }
  // workspace is re-created each render; only the route param matters here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const active = useAgent(workspace.resolvedActiveId)
  const activeAgent = active.data
  useQuestionNotice(activeAgent, active.pendingQuestion)
  const actions = useWorkspaceActions(activeAgent)

  // The Diff / Files / PR / terminal panes follow the root agent (a thread child shares its parent's worktree).
  const rootId = workspace.rootAgentId
  const sameAsActive = !!rootId && !!activeAgent && rootId === activeAgent.id
  const { data: rootQueryData } = useHuxfluxQuery({
    queryKey: queryKeys.agents.detail(rootId),
    queryFn: () => api.agents.get(rootId!),
    enabled: !!rootId && !sameAsActive,
    staleTime: 10_000,
  })
  const rootAgent = (sameAsActive ? activeAgent : rootQueryData) ?? activeAgent
  const { data: repos = [], isPending: reposPending } = useRepos()
  const hasDiff = !rootAgent || isGitRepo(rootAgent, repos.find((r) => r.id === rootAgent.repoId))
  const hasPR = hasDiff && githubEnabled && !!rootAgent?.prStatus
  const ui = useAgentWorkspaceLayout(agentId, { hasDiff, hasPR, settled: !!rootAgent && !reposPending })

  const { pendingComments, setPendingComments } = workspace
  const comments = useMemo(() => ({
    pendingComments,
    onAddComment: (c: PRComment) => setPendingComments((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c])),
    onRemoveComment: (id: string) => setPendingComments((prev) => prev.filter((c) => c.id !== id)),
  }), [pendingComments, setPendingComments])

  if (!activeAgent || !rootAgent) return <HomeView />

  const openFileAt = (path: string) => {
    ui.show("files")
    setRequests((r) => ({ ...r, fileOpen: { path, nonce: Date.now() } }))
  }
  const openDiffAt = (file: FileChange) => {
    if (!hasDiff) { openFileAt(file.path); return }
    ui.show("diff")
    setRequests((r) => ({ ...r, diffFocus: { path: file.path, nonce: Date.now() } }))
  }
  // Toggling a pane by hand drops any pending jump so it does not replay on remount.
  const togglePane = (pane: SidePaneId) => {
    setRequests({ diffFocus: null, fileOpen: null })
    ui.toggle(pane)
  }

  const section = (which: "diff" | "files" | "pr") => (
    <SideTopSection section={which} agent={rootAgent} buffers={buffers} requests={requests} onOpenFile={openFileAt} {...comments} />
  )
  const terminal = <WorkspaceTerminal agent={rootAgent} activeTab={ui.terminalTab} onTabChange={ui.setTerminalTab} />
  const chat = (
    <ChatView
      agent={activeAgent}
      isStreaming={active.isStreaming}
      loadMore={active.loadMore}
      hasMore={active.hasMore}
      isLoadingMore={active.isLoadingMore}
      tabs={workspace.tabs}
      activeTabId={workspace.activeTabId}
      onTabSelect={workspace.selectTab}
      onTabClose={workspace.closeTab}
      onNewTab={() => workspace.createTab(activeAgent)}
      onNewTabWithMessage={(msg) => workspace.createTabWithMessage(activeAgent, msg)}
      onTabTitleChange={workspace.renameTab}
      {...comments}
      onOpenDiffFile={openDiffAt}
      onClearComments={() => workspace.setPendingComments([])}
      githubEnabled={githubEnabled}
      pendingQuestion={active.pendingQuestion}
      onClearPendingQuestion={active.clearPendingQuestion}
      hideHeader
      initialMessage={workspace.queuedSetupMessage}
      onConsumeInitialMessage={() => workspace.setQueuedSetupMessage(null)}
      initialDraft={workspace.setupDraft || null}
      onConsumeInitialDraft={() => workspace.setSetupDraft("")}
      initialFocus={workspace.setupInputFocused}
      onConsumeInitialFocus={() => workspace.setSetupInputFocused(false)}
    />
  )

  return (
    <WorkerPoolContextProvider {...workerPoolOptions}>
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <AgentWorkspaceHeader
          agent={rootAgent}
          isStreaming={active.isStreaming}
          githubEnabled={githubEnabled}
          onCreatePR={actions.handleCreatePR}
          onReview={actions.handleReview}
          onRun={actions.handleRun}
          sidePane={{ visible: ui.visible, onToggle: togglePane }}
          sidebarCollapsed={sidebarCollapsed}
        />
        <WorkspaceDock
          ui={ui}
          content={{ chat, diff: hasDiff && section("diff"), files: section("files"), pr: section("pr"), terminal }}
        />
      </div>
    </WorkerPoolContextProvider>
  )
}
