import { useState, useEffect, useCallback } from "react"
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

export function useWorkspace(agents: AgentSummary[]) {
  const queryClient = useQueryClient()

  const [tabs, setTabs] = useState<ChatTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null)
  const [openFileTab, setOpenFileTab] = useState<OpenFile | null>(null)
  const [pendingComments, setPendingComments] = useState<PRComment[]>([])

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
    const a = agents.find(ag => ag.id === id)
    const isAlreadyInTabs = tabs.some(t => t.agentId === id)
    if (isAlreadyInTabs) {
      setActiveTabId(id)
    } else {
      setTabs([{ agentId: id, title: a?.title ?? "Agent" }])
      setActiveTabId(id)
    }
    setSelectedPrId(null)
    setOpenFileTab(null)
    setPendingComments([])
  }

  function selectPr(id: string) {
    setSelectedPrId(id)
    setTabs([])
    setActiveTabId(null)
    setOpenFileTab(null)
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
    const suffix = Math.random().toString(36).slice(2, 6)
    const title = `${agent.title}-${suffix}`
    try {
      const created = await api.createAgent({
        title,
        branch: agent.branch,
        model: agent.model,
        shareWorktreeWith: agent.id,
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
  }, [queryClient])

  function renameTab(agentId: string, newTitle: string) {
    setTabs(prev => prev.map(t => t.agentId === agentId ? { ...t, title: newTitle } : t))
  }

  function onAgentCreated(id: string) {
    const a = agents.find(ag => ag.id === id)
    setTabs([{ agentId: id, title: a?.title ?? "Agent" }])
    setActiveTabId(id)
    setSelectedPrId(null)
  }

  const resolvedActiveId = activeTabId ?? (selectedPrId ? null : agents[0]?.id ?? null)
  const sidebarSelectedId = tabs.length > 0 ? tabs[0].agentId : ""

  return {
    tabs,
    activeTabId,
    resolvedActiveId,
    sidebarSelectedId,
    selectedPrId,
    openFileTab,
    pendingComments,
    setOpenFileTab,
    setPendingComments,
    selectAgent,
    selectPr,
    selectTab,
    closeTab,
    createTab,
    renameTab,
    onAgentCreated,
  }
}
