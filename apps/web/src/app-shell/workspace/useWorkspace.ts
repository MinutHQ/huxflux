import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@huxflux/shared"
import type { AgentSummary, PRComment } from "@huxflux/shared"
import { useChatTabs } from "./useChatTabs"
import { useFileTabs } from "./useFileTabs"
import { usePendingAgent } from "./usePendingAgent"
import { useDeletingAgent } from "./useDeletingAgent"
import { useTabActions } from "./useTabActions"
import type { DeletingAgent, PendingAgent } from "./types"

export type { ChatTab, DeletingAgent, OpenFile, PendingAgent, FileTab } from "./types"

/**
 * Composite hook orchestrating the workspace state. Internally split into
 * per-concern hooks (chat tabs, file tabs, pending/deleting lifecycle) plus
 * a tab-actions hook that owns the cross-slice flows. This function only
 * wires the lifecycle handlers that touch every slice (delete, create-done)
 * and exposes the unified public surface.
 */
export function useWorkspace(agents: AgentSummary[]) {
  const queryClient = useQueryClient()
  const chat = useChatTabs(agents)
  const files = useFileTabs(chat.activeTabId ?? "")
  const pending = usePendingAgent()
  const deleting = useDeletingAgent()
  const [pendingComments, setPendingComments] = useState<PRComment[]>([])
  const tabActions = useTabActions({ agents, chat, files, deleting, setPendingComments })

  const onAgentDeleting = useCallback((agentId: string, info: DeletingAgent) => {
    deleting.startDeleting(info)
    chat.setIntentTabs(prev => prev.filter(t => t.agentId !== agentId))
    if (chat.activeTabId === agentId) {
      chat.setIntentActiveTabId(null)
      setPendingComments([])
    }
    if (chat.rootAgentId === agentId) chat.setRootAgentId(null)
    files.clearForAgent(agentId)
    queryClient.removeQueries({ queryKey: queryKeys.agents.detail(agentId) })
  }, [chat, deleting, queryClient, files])

  const onAgentCreating = useCallback((info: PendingAgent) => pending.startPending(info), [pending])
  const clearPendingAgent = useCallback(() => pending.clearPending(), [pending])

  const onAgentCreated = useCallback((id: string) => {
    pending.setPendingAgent(null)
    deleting.setJustDeleted(false)
    const a = agents.find(ag => ag.id === id)
    chat.setIntentTabs([{ agentId: id, title: a?.title ?? "Agent" }])
    chat.setIntentActiveTabId(id)
    chat.setRootAgentId(id)
  }, [agents, chat, deleting, pending])

  // Don't auto-select an agent during or right after a deletion (the teardown
  // animation needs a stable frame before the workspace picks a fallback).
  const resolvedActiveId = (deleting.deletingAgent || deleting.justDeleted)
    ? null
    : chat.activeTabId ?? agents[0]?.id ?? null
  const sidebarSelectedId = chat.tabs.length > 0 ? chat.tabs[0]!.agentId : ""

  return {
    tabs: chat.tabs,
    activeTabId: chat.activeTabId,
    rootAgentId: chat.rootAgentId,
    resolvedActiveId,
    sidebarSelectedId,
    openFileTab: files.openFileTab,
    fileTabs: files.fileTabs,
    activeFileTabId: files.activeFileTabId,
    activeFileTab: files.activeFileTab,
    openFile: files.openFile,
    closeFileTab: files.closeFileTab,
    closeAllFileTabs: files.closeAllFileTabs,
    selectFileTab: files.selectFileTab,
    setOpenFileTab: files.setOpenFileTab,
    pendingComments,
    setPendingComments,
    pendingAgent: pending.pendingAgent,
    queuedSetupMessage: pending.queuedSetupMessage,
    setQueuedSetupMessage: pending.setQueuedSetupMessage,
    deletingAgent: deleting.deletingAgent,
    onAgentDeleting,
    clearDeletingAgent: deleting.clearDeleting,
    selectAgent: tabActions.selectAgent,
    selectTab: tabActions.selectTab,
    closeTab: tabActions.closeTab,
    createTab: tabActions.createTab,
    createTabWithMessage: tabActions.createTabWithMessage,
    renameTab: tabActions.renameTab,
    onAgentCreating,
    clearPendingAgent,
    onAgentCreated,
  }
}
