import { useCallback, useState } from "react"
import { fileTabKey, type FileTab, type OpenFile } from "./types"

type TabsMap = Record<string, FileTab[]>
type ActiveMap = Record<string, string | null>
type OpenMap = Record<string, OpenFile | null>

/**
 * Owns the per-agent file viewer state: which files are open in tabs, which
 * tab is active, and a parallel "highlighted file" pointer used by the file
 * tree to mirror the viewer's selection.
 *
 * Everything is keyed by agentId so switching the active chat tab naturally
 * swaps the visible file viewer state without any effect-driven copies.
 */
export function useFileTabs(currentAgentId: string) {
  const [fileTabsByAgent, setFileTabsByAgent] = useState<TabsMap>({})
  const [activeFileTabByAgent, setActiveFileTabByAgent] = useState<ActiveMap>({})
  const [openFileTabByAgent, setOpenFileTabByAgent] = useState<OpenMap>({})

  const fileTabs = fileTabsByAgent[currentAgentId] ?? []
  const activeFileTabId = activeFileTabByAgent[currentAgentId] ?? null
  const activeFileTab = fileTabs.find(t => t.id === activeFileTabId) ?? null
  const openFileTab = openFileTabByAgent[currentAgentId] ?? null

  const setActiveId = useCallback((agentId: string, id: string | null) => {
    setActiveFileTabByAgent(prev => ({ ...prev, [agentId]: id }))
  }, [])

  const setOpenFile = useCallback((agentId: string, file: OpenFile | null) => {
    setOpenFileTabByAgent(prev => ({ ...prev, [agentId]: file }))
  }, [])

  const openFile = useCallback((file: OpenFile) => {
    const agentId = currentAgentId
    const key = fileTabKey(file)
    setFileTabsByAgent(prev => upsertFileTab(prev, agentId, key, file))
    setActiveId(agentId, key)
    setOpenFile(agentId, file)
  }, [currentAgentId, setActiveId, setOpenFile])

  const closeFileTab = useCallback((id: string) => {
    const agentId = currentAgentId
    const current = fileTabsByAgent[agentId] ?? []
    const next = current.filter(t => t.id !== id)
    const wasActive = (activeFileTabByAgent[agentId] ?? null) === id
    setFileTabsByAgent(prev => ({ ...prev, [agentId]: next }))
    if (wasActive) {
      const idx = current.findIndex(t => t.id === id)
      const fallback = next[Math.min(idx, next.length - 1)] ?? null
      setActiveId(agentId, fallback?.id ?? null)
      setOpenFile(agentId, fallback?.file ?? null)
    }
  }, [currentAgentId, fileTabsByAgent, activeFileTabByAgent, setActiveId, setOpenFile])

  const closeAllFileTabs = useCallback(() => {
    const agentId = currentAgentId
    setFileTabsByAgent(prev => ({ ...prev, [agentId]: [] }))
    setActiveId(agentId, null)
    setOpenFile(agentId, null)
  }, [currentAgentId, setActiveId, setOpenFile])

  const selectFileTab = useCallback((id: string) => {
    const agentId = currentAgentId
    const tab = (fileTabsByAgent[agentId] ?? []).find(t => t.id === id)
    setActiveId(agentId, id)
    if (tab) setOpenFile(agentId, tab.file)
  }, [currentAgentId, fileTabsByAgent, setActiveId, setOpenFile])

  const clearForAgent = useCallback((agentId: string) => {
    setFileTabsByAgent(prev => removeKey(prev, agentId))
    setActiveFileTabByAgent(prev => removeKey(prev, agentId))
    setOpenFileTabByAgent(prev => removeKey(prev, agentId))
  }, [])

  return {
    fileTabs, activeFileTabId, activeFileTab, openFileTab,
    openFile, closeFileTab, closeAllFileTabs, selectFileTab, clearForAgent,
    setOpenFileTab: (file: OpenFile | null) => setOpenFile(currentAgentId, file),
  }
}

function upsertFileTab(prev: TabsMap, agentId: string, key: string, file: OpenFile): TabsMap {
  const current = prev[agentId] ?? []
  const existing = current.find(t => t.id === key)
  if (existing) {
    // Update scrollToPath when re-opening the changes tab; otherwise no-op.
    if (file.type === "changes" && existing.file.type === "changes") {
      return { ...prev, [agentId]: current.map(t => t.id === key ? { ...t, file } : t) }
    }
    return prev
  }
  return { ...prev, [agentId]: [...current, { id: key, file }] }
}

function removeKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map
  const next = { ...map }
  delete next[key]
  return next
}
