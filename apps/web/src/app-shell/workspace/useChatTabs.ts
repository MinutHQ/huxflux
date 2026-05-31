import { useEffect, useMemo, useState } from "react"
import { getActiveServerId } from "@huxflux/shared"
import type { AgentSummary } from "@huxflux/shared"
import type { ChatTab } from "./types"

function serverKey(key: string): string {
  const id = getActiveServerId()
  return id ? `${key}:${id}` : key
}

function readStored(key: string): string | null {
  try { return localStorage.getItem(serverKey(key)) } catch { return null }
}

function writeStored(key: string, value: string | null) {
  try {
    const k = serverKey(key)
    if (value) localStorage.setItem(k, value)
    else localStorage.removeItem(k)
  } catch { /* ignore */ }
}

/**
 * Owns chat-tab intent state and derives the visible tab set from the upstream
 * agents prop. The intent state ("which tabs the user wants open", "which one
 * is selected") is stored verbatim; the rendered `tabs` and `activeTabId` are
 * computed during render against the current agents list. This avoids
 * `set-state-in-effect` because we never write derived values back into state.
 *
 * Persistence is one-way: the derived `activeTabId` and `rootAgentId` are
 * mirrored to localStorage in effects, but those effects never call setState.
 */
export function useChatTabs(agents: AgentSummary[]) {
  // Intent: tabs the user has opened. Child tabs persist across agent prop
  // changes; sidebar (non-child) tabs disappear when their agent is removed.
  const [intentTabs, setIntentTabs] = useState<ChatTab[]>([])
  const [intentActiveTabId, setIntentActiveTabId] = useState<string | null>(() => readStored("huxflux-active-agent"))
  // Root (worktree-owning) agent for the current view. Stored under a separate
  // key so creating a child session (which changes activeTabId) cannot corrupt
  // it on refresh.
  const [rootAgentId, setRootAgentId] = useState<string | null>(() => readStored("huxflux-root-agent-id") ?? readStored("huxflux-active-agent"))

  // Derived: tabs the user actually sees. Child tabs are always kept; sidebar
  // tabs are dropped when their agent disappears. Titles refresh from agents.
  const tabs = useMemo<ChatTab[]>(() => {
    if (agents.length === 0) return intentTabs
    const agentMap = new Map(agents.map(a => [a.id, a]))
    return intentTabs
      .filter(tab => tab.isChild || agentMap.has(tab.agentId))
      .map(tab => {
        const a = agentMap.get(tab.agentId)
        return a ? { ...tab, title: a.title } : tab
      })
  }, [intentTabs, agents])

  // Derived: validated active tab.
  // 1. Empty intent → null.
  // 2. Intent matches a current tab → keep it.
  // 3. Tabs got pruned but the agents list still has other agents → fall back
  //    to the last remaining tab if any, else null.
  // 4. Agents list is still empty (initial load) → trust the restored intent;
  //    the consumer's resolvedActiveId will reconcile with agents[0] anyway.
  const activeTabId = useMemo<string | null>(() => {
    if (!intentActiveTabId) return null
    if (tabs.some(t => t.agentId === intentActiveTabId)) return intentActiveTabId
    if (agents.length === 0) return intentActiveTabId
    if (agents.some(a => a.id === intentActiveTabId)) return intentActiveTabId
    return tabs.length > 0 ? tabs[tabs.length - 1]?.agentId ?? null : null
  }, [intentActiveTabId, tabs, agents])

  // Persist derived activeTabId so a refresh restores what the user actually
  // sees (not the stale intent that may have referenced a deleted agent).
  useEffect(() => { writeStored("huxflux-active-agent", activeTabId) }, [activeTabId])
  useEffect(() => { writeStored("huxflux-root-agent-id", rootAgentId) }, [rootAgentId])

  return {
    tabs,
    activeTabId,
    rootAgentId,
    intentTabs,
    setIntentTabs,
    setIntentActiveTabId,
    setRootAgentId,
  }
}
