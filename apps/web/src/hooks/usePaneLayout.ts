import { useState, useCallback, useEffect, useRef } from "react"
import { getActiveServerId } from "@huxflux/shared"
import type { AgentSummary } from "@huxflux/shared"

// ── Types ────────────────────────────────────────────────────────────────────

export interface LeafPane {
  type: "leaf"
  id: string
  agentId: string
}

export interface SplitPane {
  type: "split"
  id: string
  direction: "horizontal" | "vertical"
  first: PaneNode
  second: PaneNode
  ratio: number // 0-100, percentage for first child
}

export type PaneNode = LeafPane | SplitPane

export interface PaneLayoutState {
  root: PaneNode
  focusedPaneId: string
}

export type DropPosition = "left" | "right" | "top" | "bottom" | "center"

// ── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0
function genId(): string {
  return `pane-${Date.now()}-${idCounter++}`
}

function storageKey(): string {
  const serverId = getActiveServerId()
  return serverId ? `huxflux-pane-layout:${serverId}` : "huxflux-pane-layout"
}

function createLeaf(agentId: string): LeafPane {
  return { type: "leaf", id: genId(), agentId }
}

/** Find a leaf pane by id in the tree */
function findLeaf(node: PaneNode, paneId: string): LeafPane | null {
  if (node.type === "leaf") return node.id === paneId ? node : null
  return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId)
}

/** Find a leaf pane by agentId */
function findLeafByAgent(node: PaneNode, agentId: string): LeafPane | null {
  if (node.type === "leaf") return node.agentId === agentId ? node : null
  return findLeafByAgent(node.first, agentId) ?? findLeafByAgent(node.second, agentId)
}

/** Get all leaf pane IDs */
function getAllLeaves(node: PaneNode): LeafPane[] {
  if (node.type === "leaf") return [node]
  return [...getAllLeaves(node.first), ...getAllLeaves(node.second)]
}

/** Replace a node in the tree by pane ID, returning a new tree */
function replaceNode(node: PaneNode, paneId: string, replacement: PaneNode): PaneNode {
  if (node.type === "leaf") {
    return node.id === paneId ? replacement : node
  }
  return {
    ...node,
    first: replaceNode(node.first, paneId, replacement),
    second: replaceNode(node.second, paneId, replacement),
  }
}

/** Remove a leaf and promote its sibling */
function removeLeaf(node: PaneNode, paneId: string): PaneNode | null {
  if (node.type === "leaf") return node.id === paneId ? null : node
  const firstResult = removeLeaf(node.first, paneId)
  if (firstResult === null) return node.second // leaf was in first, promote second
  const secondResult = removeLeaf(node.second, paneId)
  if (secondResult === null) return node.first // leaf was in second, promote first
  // Neither child was removed — recurse returned modified subtrees
  if (firstResult === node.first && secondResult === node.second) return node
  return { ...node, first: firstResult, second: secondResult }
}

/** Prune leaves whose agentId is not in the valid set */
function pruneTree(node: PaneNode, validIds: Set<string>): PaneNode | null {
  if (node.type === "leaf") return validIds.has(node.agentId) ? node : null
  const first = pruneTree(node.first, validIds)
  const second = pruneTree(node.second, validIds)
  if (!first && !second) return null
  if (!first) return second
  if (!second) return first
  return { ...node, first, second }
}

// ── Persistence ──────────────────────────────────────────────────────────────

function loadLayout(): PaneLayoutState | null {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.root && parsed?.focusedPaneId) return parsed as PaneLayoutState
  } catch { /* corrupt data */ }
  return null
}

function saveLayout(state: PaneLayoutState) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state))
  } catch { /* quota exceeded */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePaneLayout(agents: AgentSummary[], initialAgentId: string | null) {
  const [state, setState] = useState<PaneLayoutState>(() => {
    const saved = loadLayout()
    if (saved) {
      // Validate: prune panes with agents that no longer exist
      const validIds = new Set(agents.map(a => a.id))
      const pruned = pruneTree(saved.root, validIds)
      if (pruned) {
        const leaves = getAllLeaves(pruned)
        const focusValid = leaves.some(l => l.id === saved.focusedPaneId)
        return { root: pruned, focusedPaneId: focusValid ? saved.focusedPaneId : leaves[0].id }
      }
    }
    // Default: single pane with the initial agent
    const leaf = createLeaf(initialAgentId ?? agents[0]?.id ?? "")
    return { root: leaf, focusedPaneId: leaf.id }
  })

  // Debounced persistence
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveLayout(state), 300)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state])

  // Re-validate when agents list changes (agent deleted externally)
  useEffect(() => {
    if (agents.length === 0) return
    const validIds = new Set(agents.map(a => a.id))
    const leaves = getAllLeaves(state.root)
    const hasInvalid = leaves.some(l => !validIds.has(l.agentId))
    if (hasInvalid) {
      setState(prev => {
        const pruned = pruneTree(prev.root, validIds)
        if (!pruned) {
          const leaf = createLeaf(agents[0].id)
          return { root: leaf, focusedPaneId: leaf.id }
        }
        const newLeaves = getAllLeaves(pruned)
        const focusValid = newLeaves.some(l => l.id === prev.focusedPaneId)
        return { root: pruned, focusedPaneId: focusValid ? prev.focusedPaneId : newLeaves[0].id }
      })
    }
  }, [agents])

  const splitPane = useCallback((paneId: string, direction: "horizontal" | "vertical", newAgentId: string, position: DropPosition) => {
    setState(prev => {
      const target = findLeaf(prev.root, paneId)
      if (!target) return prev

      const newLeaf = createLeaf(newAgentId)
      const isFirstPosition = position === "left" || position === "top"
      const splitNode: SplitPane = {
        type: "split",
        id: genId(),
        direction,
        first: isFirstPosition ? newLeaf : target,
        second: isFirstPosition ? target : newLeaf,
        ratio: 50,
      }
      return {
        root: replaceNode(prev.root, paneId, splitNode),
        focusedPaneId: newLeaf.id,
      }
    })
  }, [])

  const closePane = useCallback((paneId: string) => {
    setState(prev => {
      const leaves = getAllLeaves(prev.root)
      if (leaves.length <= 1) return prev // don't close last pane

      const newRoot = removeLeaf(prev.root, paneId)
      if (!newRoot) return prev

      const newLeaves = getAllLeaves(newRoot)
      const focusValid = newLeaves.some(l => l.id === prev.focusedPaneId)
      return {
        root: newRoot,
        focusedPaneId: focusValid ? prev.focusedPaneId : newLeaves[0].id,
      }
    })
  }, [])

  const focusPane = useCallback((paneId: string) => {
    setState(prev => prev.focusedPaneId === paneId ? prev : { ...prev, focusedPaneId: paneId })
  }, [])

  const replaceAgent = useCallback((paneId: string, agentId: string) => {
    setState(prev => {
      const leaf = findLeaf(prev.root, paneId)
      if (!leaf || leaf.agentId === agentId) return prev
      return {
        ...prev,
        root: replaceNode(prev.root, paneId, { ...leaf, agentId }),
      }
    })
  }, [])

  const resizePane = useCallback((splitId: string, ratio: number) => {
    setState(prev => {
      function updateRatio(node: PaneNode): PaneNode {
        if (node.type === "leaf") return node
        if (node.id === splitId) return { ...node, ratio }
        return { ...node, first: updateRatio(node.first), second: updateRatio(node.second) }
      }
      return { ...prev, root: updateRatio(prev.root) }
    })
  }, [])

  const getFocusedAgentId = useCallback((): string | null => {
    const leaf = findLeaf(state.root, state.focusedPaneId)
    return leaf?.agentId ?? null
  }, [state])

  const paneCount = getAllLeaves(state.root).length

  return {
    state,
    splitPane,
    closePane,
    focusPane,
    replaceAgent,
    resizePane,
    getFocusedAgentId,
    paneCount,
    findLeafByAgent: (agentId: string) => findLeafByAgent(state.root, agentId),
  }
}
