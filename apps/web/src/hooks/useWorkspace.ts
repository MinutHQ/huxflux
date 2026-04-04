import { useState, useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@hive/shared"
import type { Agent, AgentSummary, FileChange, PRComment } from "@hive/shared"

export interface ChatTab {
  agentId: string
  title: string
  isChild?: boolean
}

export type OpenFile = { type: "diff"; file: FileChange } | { type: "content"; path: string }

export interface PendingAgent {
  title: string
  branch: string
  repoName: string
  estimatedMs: number
}

export interface DeletingAgent {
  title: string
  branch: string
  repoName: string
}

export function useWorkspace(agents: AgentSummary[]) {
  const queryClient = useQueryClient()

  const [tabs, setTabs] = useState<ChatTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    try { return localStorage.getItem("hive-active-agent") } catch { return null }
  })
  // The root (worktree-owning) agent for the current view — never changes when
  // switching between child chat sessions, so the terminal stays stable.
  // Persisted under a SEPARATE key from activeTabId so that creating a child
  // session (which updates activeTabId) never corrupts rootAgentId on refresh.
  const [rootAgentId, setRootAgentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hive-root-agent-id")
          ?? localStorage.getItem("hive-active-agent")
    } catch { return null }
  })
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null)
  const [lastPrId, setLastPrId] = useState<string | null>(null)
  const lastAgentId = useRef<string | null>(null)
  const [openFileTab, setOpenFileTab] = useState<OpenFile | null>(null)
  const [pendingComments, setPendingComments] = useState<PRComment[]>([])
  const [pendingAgent, setPendingAgent] = useState<PendingAgent | null>(null)
  const [deletingAgent, setDeletingAgent] = useState<DeletingAgent | null>(null)
  const [justDeleted, setJustDeleted] = useState(false)

  // Persist active tab across refreshes
  useEffect(() => {
    try {
      if (activeTabId) localStorage.setItem("hive-active-agent", activeTabId)
      else localStorage.removeItem("hive-active-agent")
    } catch { /* ignore */ }
  }, [activeTabId])

  // Persist root agent separately so child-session tab switches don't corrupt it
  useEffect(() => {
    try {
      if (rootAgentId) localStorage.setItem("hive-root-agent-id", rootAgentId)
      else localStorage.removeItem("hive-root-agent-id")
    } catch { /* ignore */ }
  }, [rootAgentId])

  // Sync tabs with agent data — update titles for sidebar agents, remove deleted ones
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const agentIds = new Set(agents.map(a => a.id))
    const next = tabs
      .filter(tab => tab.isChild || agentIds.has(tab.agentId))
      .map(tab => {
        const a = agents.find(ag => ag.id === tab.agentId)
        return a ? { ...tab, title: a.title } : tab
      })
    // Guard: only update state when something actually changed.
    // `agents` can be a new array reference every render (default `[]`),
    // so always calling setTabs would cause an infinite loop.
    const tabsChanged = next.length !== tabs.length ||
      next.some((t, i) => t.agentId !== tabs[i].agentId || t.title !== tabs[i].title || t.isChild !== tabs[i].isChild)
    if (tabsChanged) setTabs(next)
    if (activeTabId && !next.some(t => t.agentId === activeTabId)) {
      setActiveTabId(next.length > 0 ? next[next.length - 1].agentId : null)
      setOpenFileTab(null)
      setPendingComments([])
    }
  }, [agents])

  function selectAgent(id: string) {
    lastAgentId.current = id
    const a = agents.find(ag => ag.id === id)
    const isAlreadyInTabs = tabs.some(t => t.agentId === id)
    setRootAgentId(id)
    if (isAlreadyInTabs) {
      setActiveTabId(id)
    } else {
      setTabs([{ agentId: id, title: a?.title ?? "Agent" }])
      setActiveTabId(id)
      // Fetch persisted child sessions from server and restore as tabs
      api.getAgentSessions(id).then(sessions => {
        if (sessions.length === 0) return
        // Pre-fill cache for each session so switching tabs doesn't flash the
        // parent agent's messages via placeholderData while the child loads.
        for (const s of sessions) {
          queryClient.setQueryData(["agent", s.id], (old: Agent | undefined) =>
            old ?? { ...s, messages: [], fileChanges: [], terminalOutput: [] }
          )
        }
        const childTabs: ChatTab[] = sessions.map(s => ({ agentId: s.id, title: s.title, isChild: true }))
        setTabs(prev => {
          if (prev[0]?.agentId !== id) return prev // user switched away
          const existingIds = new Set(prev.map(t => t.agentId))
          const newTabs = childTabs.filter(t => !existingIds.has(t.agentId))
          return newTabs.length > 0 ? [...prev, ...newTabs] : prev
        })
      }).catch(() => {})
    }
    setJustDeleted(false)
    setSelectedPrId(null)
    setOpenFileTab(null)
    setPendingComments([])
  }

  function selectPr(id: string) {
    if (activeTabId) lastAgentId.current = activeTabId
    setLastPrId(id)
    setSelectedPrId(id)
    setTabs([])
    setActiveTabId(null)
    setOpenFileTab(null)
  }

  function switchToAgentView() {
    const targetId = lastAgentId.current ?? agents[0]?.id
    if (targetId) selectAgent(targetId)
  }

  function switchToReviewView() {
    if (lastPrId) {
      selectPr(lastPrId)
    } else {
      setActiveTabId(null)
      setSelectedPrId(null)
    }
  }

  function selectTab(agentId: string) {
    setActiveTabId(agentId)
    setOpenFileTab(null)
    setPendingComments([])
  }

  function closeTab(agentId: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.agentId !== agentId)
      if (agentId === activeTabId) {
        if (next.length > 0) {
          setActiveTabId(next[next.length - 1].agentId)
        } else {
          setActiveTabId(agents[0]?.id ?? null)
        }
      }
      return next
    })
    setOpenFileTab(null)
  }

  const createTab = useCallback(async (agent: Agent) => {
    // Always share with the root agent (first tab) so all sessions are siblings,
    // not grandchildren when a child tab is active.
    const rootAgentId = tabs[0]?.agentId ?? agent.id
    try {
      const created = await api.createAgent({
        title: "Untitled",
        branch: agent.branch,
        model: agent.model,
        shareWorktreeWith: rootAgentId,
      })
      // Pre-fill the cache with the new empty agent so useAgent doesn't flash
      // the parent agent's messages via placeholderData while the fetch loads.
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

  function renameTab(agentId: string, newTitle: string) {
    setTabs(prev => prev.map(t => t.agentId === agentId ? { ...t, title: newTitle } : t))
  }

  function onAgentDeleting(agentId: string, info: DeletingAgent) {
    setDeletingAgent(info)
    setJustDeleted(true)
    // Clear workspace state for the deleted agent so it doesn't reopen after the animation
    setTabs(prev => prev.filter(t => t.agentId !== agentId))
    if (activeTabId === agentId) {
      setActiveTabId(null)
      setOpenFileTab(null)
      setPendingComments([])
    }
    if (rootAgentId === agentId) setRootAgentId(null)
    // Evict cached agent data so useAgent doesn't return stale data
    queryClient.removeQueries({ queryKey: ["agent", agentId] })
  }

  function clearDeletingAgent() {
    setDeletingAgent(null)
  }

  function onAgentCreating(info: PendingAgent) {
    setPendingAgent(info)
    setSelectedPrId(null)
  }

  function clearPendingAgent() {
    setPendingAgent(null)
  }

  function onAgentCreated(id: string) {
    setPendingAgent(null)
    setJustDeleted(false)
    const a = agents.find(ag => ag.id === id)
    setTabs([{ agentId: id, title: a?.title ?? "Agent" }])
    setActiveTabId(id)
    setRootAgentId(id)
    setSelectedPrId(null)
  }

  // Validate restored activeTabId — clear if it no longer exists in agents OR current tabs.
  // Child session tabs are not in the agents list, so we must check tabs too.
  useEffect(() => {
    if (activeTabId && agents.length > 0 &&
        !agents.some(a => a.id === activeTabId) &&
        !tabs.some(t => t.agentId === activeTabId)) {
      setActiveTabId(null)
    }
  }, [agents, activeTabId, tabs])

  // Don't auto-select an agent during or right after a deletion
  const resolvedActiveId = (deletingAgent || justDeleted)
    ? null
    : activeTabId ?? (selectedPrId ? null : agents[0]?.id ?? null)
  const sidebarSelectedId = tabs.length > 0 ? tabs[0].agentId : ""

  return {
    tabs,
    activeTabId,
    rootAgentId,
    resolvedActiveId,
    sidebarSelectedId,
    selectedPrId,
    openFileTab,
    pendingComments,
    pendingAgent,
    deletingAgent,
    onAgentDeleting,
    clearDeletingAgent,
    setOpenFileTab,
    setPendingComments,
    selectAgent,
    selectPr,
    switchToAgentView,
    switchToReviewView,
    selectTab,
    closeTab,
    createTab,
    renameTab,
    onAgentCreating,
    clearPendingAgent,
    onAgentCreated,
  }
}
