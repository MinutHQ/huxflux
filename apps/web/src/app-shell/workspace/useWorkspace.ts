import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@huxflux/shared"
import type { AgentSummary, PRComment } from "@huxflux/shared"
import type { FileBuffer } from "@/domains/file-changes/file-changes.types"
import { useChatTabs } from "./useChatTabs"
import { usePendingAgent } from "./usePendingAgent"
import { useDeletingAgent } from "./useDeletingAgent"
import { useTabActions } from "./useTabActions"
import type { DeletingAgent, PendingAgent } from "./types"

export type { ChatTab, DeletingAgent, PendingAgent } from "./types"

/**
 * Composite hook orchestrating the workspace state. Internally split into
 * per-concern hooks (chat tabs, pending/deleting lifecycle) plus
 * a tab-actions hook that owns the cross-slice flows. This function only
 * wires the lifecycle handlers that touch every slice (delete, create-done)
 * and exposes the unified public surface.
 */
export function useWorkspace(agents: AgentSummary[]) {
  const queryClient = useQueryClient()
  const chat = useChatTabs(agents)
  const pending = usePendingAgent()
  const deleting = useDeletingAgent()
  const [pendingComments, setPendingComments] = useState<PRComment[]>([])
  // Unsaved editor drafts per agent. Lives here, above the per-agent view
  // (which remounts on agent switch), so switching agents does not drop edits.
  const [draftStores] = useState(() => new Map<string, Map<string, FileBuffer>>())
  const fileDraftsFor = useCallback((agentId: string) => {
    let store = draftStores.get(agentId)
    if (!store) {
      store = new Map()
      draftStores.set(agentId, store)
    }
    return store
  }, [draftStores])
  const tabActions = useTabActions({ agents, chat, deleting, setPendingComments })

  const onAgentDeleting = useCallback((agentId: string, info: DeletingAgent) => {
    deleting.startDeleting(info)
    chat.setIntentTabs(prev => prev.filter(t => t.agentId !== agentId))
    if (chat.activeTabId === agentId) {
      chat.setIntentActiveTabId(null)
      setPendingComments([])
    }
    if (chat.rootAgentId === agentId) chat.setRootAgentId(null)
    queryClient.removeQueries({ queryKey: queryKeys.agents.detail(agentId) })
  }, [chat, deleting, queryClient])

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
    pendingComments,
    setPendingComments,
    fileDraftsFor,
    pendingAgent: pending.pendingAgent,
    queuedSetupMessage: pending.queuedSetupMessage,
    setQueuedSetupMessage: pending.setQueuedSetupMessage,
    setupDraft: pending.setupDraft,
    setSetupDraft: pending.setSetupDraft,
    setupInputFocused: pending.setupInputFocused,
    setSetupInputFocused: pending.setSetupInputFocused,
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
