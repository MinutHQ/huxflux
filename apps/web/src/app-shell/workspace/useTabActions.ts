import { useCallback, useRef } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, queryKeys } from "@huxflux/shared"
import type { Agent, AgentSummary, PRComment } from "@huxflux/shared"
import type { useChatTabs } from "./useChatTabs"
import type { useFileTabs } from "./useFileTabs"
import type { useDeletingAgent } from "./useDeletingAgent"
import type { ChatTab } from "./types"

type ChatHandle = ReturnType<typeof useChatTabs>
type FilesHandle = ReturnType<typeof useFileTabs>
type DeletingHandle = ReturnType<typeof useDeletingAgent>

interface UseTabActionsArgs {
  agents: AgentSummary[]
  chat: ChatHandle
  files: FilesHandle
  deleting: DeletingHandle
  setPendingComments: (next: PRComment[]) => void
}

/**
 * Cross-slice tab/agent flows. Owns the two refs that survive across renders
 * but don't belong to a single slice: which child tabs the user has closed (so
 * a late session fetch doesn't re-open them) and the most recently selected
 * agent (debug-only today, kept for parity with the original hook).
 */
export function useTabActions({ agents, chat, files, deleting, setPendingComments }: UseTabActionsArgs) {
  const queryClient = useQueryClient()
  const closedTabIdsRef = useRef(new Set<string>())
  const lastAgentIdRef = useRef<string | null>(null)

  const selectAgent = useCallback((id: string) => {
    lastAgentIdRef.current = id
    markUnreadCleared(agents, id, queryClient)
    const isAlreadyInTabs = chat.intentTabs.some(t => t.agentId === id)
    chat.setRootAgentId(id)
    if (isAlreadyInTabs) {
      chat.setIntentActiveTabId(id)
    } else {
      closedTabIdsRef.current.clear()
      const agentTitle = agents.find(ag => ag.id === id)?.title ?? "Agent"
      chat.setIntentTabs([{ agentId: id, title: agentTitle }])
      chat.setIntentActiveTabId(id)
      void fetchAndAttachChildSessions(id, queryClient, chat, closedTabIdsRef.current)
    }
    deleting.setJustDeleted(false)
    setPendingComments([])
  }, [agents, queryClient, chat, deleting, setPendingComments])

  const selectTab = useCallback((agentId: string) => {
    chat.setIntentActiveTabId(agentId)
    setPendingComments([])
  }, [chat, setPendingComments])

  const closeTab = useCallback((agentId: string) => {
    const tab = chat.intentTabs.find(t => t.agentId === agentId)
    if (!tab?.isChild) return
    closedTabIdsRef.current.add(agentId)
    api.agents.delete(agentId).catch(() => {})
    queryClient.removeQueries({ queryKey: queryKeys.agents.detail(agentId) })
    const nextTabs = chat.intentTabs.filter(t => t.agentId !== agentId)
    chat.setIntentTabs(nextTabs)
    if (agentId === chat.activeTabId) {
      const fallback = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1]!.agentId : (agents[0]?.id ?? null)
      chat.setIntentActiveTabId(fallback)
    }
    files.clearForAgent(agentId)
  }, [chat, queryClient, agents, files])

  const createTab = useCallback(
    (agent: Agent) => createChildTab({ agent, title: "Untitled", chat, queryClient, setPendingComments }),
    [chat, queryClient, setPendingComments],
  )

  const createTabWithMessage = useCallback(
    async (agent: Agent, message: string, opts?: { model?: string; provider?: string }) => {
      const created = await createChildTab({
        agent, title: "Review", chat, queryClient, setPendingComments,
        model: opts?.model || agent.model,
        provider: opts?.provider,
        errorLabel: "review tab",
      })
      if (created) {
        try {
          // fire-and-forget; intentional: chained send after a tab-create; failure already surfaced via toast
          // eslint-disable-next-line no-restricted-syntax
          await api.agents.sendMessage(created.id, message)
        } catch { /* swallowed; create-failure already surfaced */ }
      }
    },
    [chat, queryClient, setPendingComments],
  )

  const renameTab = useCallback((agentId: string, newTitle: string) => {
    chat.setIntentTabs(prev => prev.map(t => t.agentId === agentId ? { ...t, title: newTitle } : t))
  }, [chat])

  return { selectAgent, selectTab, closeTab, createTab, createTabWithMessage, renameTab }
}

function markUnreadCleared(agents: AgentSummary[], id: string, queryClient: QueryClient) {
  const a = agents.find(ag => ag.id === id)
  if (!a?.unread) return
  api.agents.update(id, { unread: 0 }).catch(() => {})
  queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
    old ? old.map((ag) => ag.id === id ? { ...ag, unread: 0 } : ag) : old,
  )
}

async function fetchAndAttachChildSessions(rootId: string, queryClient: QueryClient, chat: ChatHandle, closed: Set<string>) {
  try {
    // fire-and-forget; intentional: lazy session restore on tab open with custom cache seeding, not a render-time read
    // eslint-disable-next-line no-restricted-syntax
    const sessions = await api.agents.sessions(rootId)
    if (sessions.length === 0) return
    // Pre-fill cache for each session so switching tabs doesn't flash the
    // parent agent's messages via placeholderData while the child loads.
    for (const s of sessions) {
      queryClient.setQueryData(queryKeys.agents.detail(s.id), (old: Agent | undefined) =>
        old ?? { ...s, messages: [], fileChanges: [], terminalOutput: [] },
      )
    }
    const childTabs: ChatTab[] = sessions
      .filter(s => !closed.has(s.id))
      .map(s => ({ agentId: s.id, title: s.title, isChild: true }))
    chat.setIntentTabs(prev => {
      if (prev[0]?.agentId !== rootId) return prev // user switched away
      const existingIds = new Set(prev.map(t => t.agentId))
      const additions = childTabs.filter(t => !existingIds.has(t.agentId))
      return additions.length > 0 ? [...prev, ...additions] : prev
    })
  } catch { /* network errors are non-fatal for session restore */ }
}

interface CreateChildTabArgs {
  agent: Agent
  title: string
  chat: ChatHandle
  queryClient: QueryClient
  setPendingComments: (next: PRComment[]) => void
  model?: string
  provider?: string
  errorLabel?: string
}

async function createChildTab({ agent, title, chat, queryClient, setPendingComments, model, provider, errorLabel = "tab" }: CreateChildTabArgs): Promise<{ id: string } | null> {
  // Always share with the root agent (first tab) so sibling sessions stay
  // siblings even when a child tab is currently active.
  const rootAgentId = chat.intentTabs[0]?.agentId ?? agent.id
  try {
    // fire-and-forget; intentional: tab-creation flow seeds the cache manually and updates UI state in a specific order
    // eslint-disable-next-line no-restricted-syntax
    const created = await api.agents.create({
      title,
      branch: agent.branch,
      model: model ?? agent.model,
      provider,
      shareWorktreeWith: rootAgentId,
    })
    // Seed empty collections on the new detail entry so useAgent doesn't flash
    // the parent agent's messages via placeholderData while the fetch loads.
    queryClient.setQueryData(queryKeys.agents.detail(created.id), {
      ...created,
      messages: [],
      fileChanges: [],
      terminalOutput: [],
    })
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
    const newTab: ChatTab = { agentId: created.id, title: created.title, isChild: true }
    chat.setIntentTabs(prev => {
      const hasCurrentAgent = prev.some(t => t.agentId === agent.id)
      const base = hasCurrentAgent ? prev : [{ agentId: agent.id, title: agent.title }, ...prev]
      return [...base, newTab]
    })
    chat.setIntentActiveTabId(created.id)
    setPendingComments([])
    return created
  } catch (err) {
    toast.error(`Failed to create ${errorLabel}: ${err instanceof Error ? err.message : "unknown"}`)
    return null
  }
}
