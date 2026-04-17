import { useState, useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@huxflux/shared"
import type { Agent, AgentSummary, FileChange, PRComment } from "@huxflux/shared"
import { useAgents } from "@huxflux/shared"

export interface ChatTab {
  agentId: string
  title: string
  isChild?: boolean
}

export type OpenFile = { type: "diff"; file: FileChange } | { type: "content"; path: string } | { type: "diff-browser" } | { type: "pr" }

/**
 * Per-pane workspace state. Each pane in the split view gets its own instance.
 * Manages: chat tabs, active tab, root agent, file viewer, pending comments.
 */
export function usePaneWorkspace(agentId: string) {
  const queryClient = useQueryClient()
  const { data: agents = [] } = useAgents()

  const [tabs, setTabs] = useState<ChatTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [rootAgentId, setRootAgentId] = useState<string | null>(null)
  const closedTabIds = useRef(new Set<string>())
  const [openFileTab, setOpenFileTab] = useState<OpenFile | null>(null)
  const [pendingComments, setPendingComments] = useState<PRComment[]>([])

  // When the pane's agentId changes, initialize tabs for the new agent
  const prevAgentIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!agentId || agentId === prevAgentIdRef.current) return
    prevAgentIdRef.current = agentId

    const a = agents.find(ag => ag.id === agentId)
    if (a?.unread) {
      api.updateAgent(agentId, { unread: 0 }).catch(() => {})
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) =>
        old ? old.map((ag) => ag.id === agentId ? { ...ag, unread: 0 } : ag) : old
      )
    }

    closedTabIds.current.clear()
    setRootAgentId(agentId)
    setTabs([{ agentId, title: a?.title ?? "Agent" }])
    setActiveTabId(agentId)
    setOpenFileTab(null)
    setPendingComments([])

    // Fetch child sessions
    api.getAgentSessions(agentId).then(sessions => {
      if (sessions.length === 0) return
      for (const s of sessions) {
        queryClient.setQueryData(["agent", s.id], (old: Agent | undefined) =>
          old ?? { ...s, messages: [], fileChanges: [], terminalOutput: [] }
        )
      }
      const childTabs: ChatTab[] = sessions
        .filter(s => !closedTabIds.current.has(s.id))
        .map(s => ({ agentId: s.id, title: s.title, isChild: true }))
      setTabs(prev => {
        if (prev[0]?.agentId !== agentId) return prev
        const existingIds = new Set(prev.map(t => t.agentId))
        const newTabs = childTabs.filter(t => !existingIds.has(t.agentId))
        return newTabs.length > 0 ? [...prev, ...newTabs] : prev
      })
    }).catch(() => {})
  }, [agentId, agents])

  // Sync tab titles with agent data
  useEffect(() => {
    if (agents.length === 0) return
    const agentIds = new Set(agents.map(a => a.id))
    setTabs(prev => {
      const next = prev
        .filter(tab => tab.isChild || agentIds.has(tab.agentId))
        .map(tab => {
          const a = agents.find(ag => ag.id === tab.agentId)
          return a ? { ...tab, title: a.title } : tab
        })
      const changed = next.length !== prev.length ||
        next.some((t, i) => t.agentId !== prev[i]?.agentId || t.title !== prev[i]?.title)
      if (!changed) return prev
      setActiveTabId(current => {
        if (current && !next.some(t => t.agentId === current)) {
          return next.length > 0 ? next[next.length - 1].agentId : null
        }
        return current
      })
      return next
    })
  }, [agents])

  const resolvedActiveId = activeTabId ?? agentId

  function selectTab(id: string) {
    setActiveTabId(id)
    setOpenFileTab(null)
    setPendingComments([])
  }

  function closeTab(id: string) {
    const tab = tabs.find(t => t.agentId === id)
    if (!tab?.isChild) return

    closedTabIds.current.add(id)
    api.deleteAgent(id).catch(() => {})
    queryClient.removeQueries({ queryKey: ["agent", id] })
    setTabs(prev => {
      const next = prev.filter(t => t.agentId !== id)
      if (id === activeTabId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].agentId : agentId)
      }
      return next
    })
    setOpenFileTab(null)
  }

  const createTab = useCallback(async (agent: Agent) => {
    const root = tabs[0]?.agentId ?? agent.id
    try {
      const created = await api.createAgent({
        title: "Untitled",
        branch: agent.branch,
        model: agent.model,
        shareWorktreeWith: root,
      })
      queryClient.setQueryData(["agent", created.id], {
        ...created,
        messages: created.messages ?? [],
        fileChanges: created.fileChanges ?? [],
        terminalOutput: created.terminalOutput ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      const newTab: ChatTab = { agentId: created.id, title: created.title, isChild: true }
      setTabs(prev => {
        const hasCurrentAgent = prev.some(t => t.agentId === agent.id)
        const base = hasCurrentAgent ? prev : [{ agentId: agent.id, title: agent.title }, ...prev]
        return [...base, newTab]
      })
      setActiveTabId(created.id)
      setOpenFileTab(null)
      setPendingComments([])
    } catch (err) {
      toast.error(`Failed to create tab: ${err instanceof Error ? err.message : "unknown"}`)
    }
  }, [queryClient, tabs])

  const createTabWithMessage = useCallback(async (agent: Agent, message: string, opts?: { model?: string; provider?: string }) => {
    const root = tabs[0]?.agentId ?? agent.id
    try {
      const created = await api.createAgent({
        title: "Review",
        branch: agent.branch,
        model: opts?.model || agent.model,
        provider: opts?.provider || undefined,
        shareWorktreeWith: root,
      })
      queryClient.setQueryData(["agent", created.id], {
        ...created,
        messages: created.messages ?? [],
        fileChanges: created.fileChanges ?? [],
        terminalOutput: created.terminalOutput ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      const newTab: ChatTab = { agentId: created.id, title: "Review", isChild: true }
      setTabs(prev => {
        const hasCurrentAgent = prev.some(t => t.agentId === agent.id)
        const base = hasCurrentAgent ? prev : [{ agentId: agent.id, title: agent.title }, ...prev]
        return [...base, newTab]
      })
      setActiveTabId(created.id)
      setOpenFileTab(null)
      setPendingComments([])
      await api.sendMessage(created.id, { content: message })
    } catch (err) {
      toast.error(`Failed to create review tab: ${err instanceof Error ? err.message : "unknown"}`)
    }
  }, [queryClient, tabs])

  function renameTab(id: string, newTitle: string) {
    setTabs(prev => prev.map(t => t.agentId === id ? { ...t, title: newTitle } : t))
  }

  return {
    tabs,
    activeTabId,
    rootAgentId,
    resolvedActiveId,
    openFileTab,
    pendingComments,
    setOpenFileTab,
    setPendingComments,
    selectTab,
    closeTab,
    createTab,
    createTabWithMessage,
    renameTab,
  }
}
