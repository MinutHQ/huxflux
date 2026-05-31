import { useEffect, useState } from "react"
import { api } from "@huxflux/shared"
import type { TerminalTab } from "../agents.types"
import { getStoredActiveTabId, setStoredActiveTabId } from "../utils"
import { closeTerminalSession } from "../terminalSession"

interface UseTerminalTabsResult {
  tabs: TerminalTab[]
  activeTerminalId: string
  tabsLoaded: boolean
  setActiveTerminalId: (id: string) => void
  addTab: () => Promise<TerminalTab | null>
  renameTab: (terminalId: string, label: string | null) => void
  closeTab: (terminalId: string) => void
}

const DEFAULT_TAB: TerminalTab = { id: "default", terminalId: "t1", orderIdx: 0 }

/**
 * Load + manage the persisted terminal-tab list for an agent.
 * Local state mirrors the server with fire-and-forget writes; on failure the
 * server is the source of truth on the next mount, so we just swallow errors.
 */
export function useTerminalTabs(agentId: string): UseTerminalTabsResult {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTerminalId, setActive] = useState<string>("t1")
  // Tracks which agent's tab list is currently held in `tabs`. `tabsLoaded`
  // is derived: when this matches `agentId`, the state below is for the
  // current agent. Storing the loaded id (instead of a boolean we reset)
  // avoids a synchronous setState at the top of the effect on every switch.
  const [loadedAgentId, setLoadedAgentId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.agents.terminalTabs(agentId).then((rows) => {
      if (cancelled) return
      const loaded: TerminalTab[] = rows
        .sort((a, b) => a.orderIdx - b.orderIdx)
        .map((r) => ({ id: r.id, terminalId: r.terminalId, orderIdx: r.orderIdx, label: r.label ?? undefined }))

      const resolved = loaded.length > 0 ? loaded : [DEFAULT_TAB]
      setTabs(resolved)

      const stored = getStoredActiveTabId(agentId)
      const activeExists = resolved.some((t) => t.terminalId === stored)
      const activeId = activeExists ? stored! : resolved[0].terminalId
      setActive(activeId)
      setLoadedAgentId(agentId)
    }).catch(() => {
      if (cancelled) return
      setTabs([DEFAULT_TAB])
      setActive("t1")
      setLoadedAgentId(agentId)
    })
    return () => { cancelled = true }
  }, [agentId])

  const tabsLoaded = loadedAgentId === agentId

  function setActiveTerminalId(id: string) {
    setActive(id)
    setStoredActiveTabId(agentId, id)
  }

  async function addTab(): Promise<TerminalTab | null> {
    try {
      // fire-and-forget; intentional: terminal-tab create has bespoke optimistic local-state updates and survives without invalidation
      // eslint-disable-next-line no-restricted-syntax
      const created = await api.agents.createTerminalTab(agentId)
      const newTab: TerminalTab = {
        id: created.id,
        terminalId: created.terminalId,
        orderIdx: created.orderIdx,
        label: created.label ?? undefined,
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTerminalId(created.terminalId)
      return newTab
    } catch {
      return null
    }
  }

  function renameTab(terminalId: string, label: string | null) {
    setTabs((prev) => prev.map((t) =>
      t.terminalId === terminalId ? { ...t, label: label ?? undefined } : t,
    ))
    // Persist to server (fire-and-forget)
    api.agents.updateTerminalTab(agentId, terminalId, { label }).catch(() => { /* ignore */ })
  }

  function closeTab(terminalId: string) {
    if (tabs.length <= 1) return

    setTabs((prev) => {
      const next = prev.filter((t) => t.terminalId !== terminalId)
      if (terminalId === activeTerminalId) {
        const idx = prev.findIndex((t) => t.terminalId === terminalId)
        const nextActive = next[Math.min(idx, next.length - 1)].terminalId
        setActive(nextActive)
        setStoredActiveTabId(agentId, nextActive)
      }
      return next
    })

    closeTerminalSession(`${agentId}:${terminalId}`)

    // Delete from server (also kills PTY process on server)
    api.agents.deleteTerminalTab(agentId, terminalId).catch(() => { /* ignore */ })
  }

  return { tabs, activeTerminalId, tabsLoaded, setActiveTerminalId, addTab, renameTab, closeTab }
}
