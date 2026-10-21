import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"
import type { DockHandle, PaneVisibility, SidePaneId, TerminalTopTab, WorkspacePaneId } from "../agents.types"
import { paneOrder, resetLayout } from "../service/workspaceDock"

const sidePanes: readonly SidePaneId[] = ["diff", "files", "pr", "terminal"]
const sectionPanes: readonly SidePaneId[] = ["diff", "files", "pr"]

const defaultVisibility: PaneVisibility = { hidden: ["files", "pr"], lastSide: ["diff"] }

function isPaneList(raw: unknown): raw is SidePaneId[] {
  return Array.isArray(raw) && raw.every((p) => sidePanes.includes(p as SidePaneId))
}

function isVisibility(raw: unknown): raw is PaneVisibility {
  if (!raw || typeof raw !== "object") return false
  const r = raw as Record<string, unknown>
  const maximizedOk = r.maximized === undefined || paneOrder.includes(r.maximized as WorkspacePaneId)
  return isPaneList(r.hidden) && isPaneList(r.lastSide) && maximizedOk
}

/** Outside a git repo there is nothing to diff: Files shows wherever Diff would. */
function withoutDiff(v: PaneVisibility): PaneVisibility {
  const lastSide = [...new Set(v.lastSide.map((p) => (p === "diff" ? "files" : p)))]
  const hidden = v.hidden.includes("diff")
    ? v.hidden
    : [...v.hidden.filter((p) => p !== "files"), "diff" as const]
  return { ...v, hidden, lastSide }
}

/** Cmd/Ctrl+U: closes every open Diff / Files / PR pane, or reopens the set it last closed. */
function toggleSections(v: PaneVisibility): PaneVisibility {
  const open = sectionPanes.filter((p) => !v.hidden.includes(p))
  if (open.length) return { ...v, hidden: [...new Set([...v.hidden, ...open])], lastSide: open }
  const reopen = v.lastSide.length ? v.lastSide : ["diff" as const]
  return { ...v, hidden: v.hidden.filter((p) => !reopen.includes(p)) }
}

/** Cmd/Ctrl+U toggles the Diff / Files / PR panes, Cmd/Ctrl+J the terminal. */
function useSectionShortcuts(
  setVisibility: (update: (v: PaneVisibility) => PaneVisibility) => void,
  toggle: (pane: SidePaneId) => void,
) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === "u") {
        e.preventDefault()
        setVisibility(toggleSections)
      }
      if (e.key === "j") {
        e.preventDefault()
        toggle("terminal")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setVisibility, toggle])
}

/**
 * Pane state for the per-agent workspace dock. Where panes sit (the split
 * tree, tabs, sizes) is one global layout owned by `WorkspaceDock`; which
 * panes are shown is persisted per agent here. The chat is always shown.
 *
 * Shortcuts: Cmd/Ctrl+U toggles the Diff / Files / PR panes (reopening the
 * last set), Cmd/Ctrl+J toggles the terminal. `huxflux:toggle-terminal-maximize`
 * maximizes the terminal. The maximized pane is remembered per agent too.
 * With `hasDiff` false (a folder, not a git repo) the Diff pane is replaced by Files; with `hasPR` false the PR pane stays
 * hidden without touching what is saved. `settled` is false while those two
 * are still loading, and the dock waits for it so it never rearranges on a guess.
 */
export function useAgentWorkspaceLayout(
  agentId: string,
  { hasDiff, hasPR, settled }: { hasDiff: boolean; hasPR: boolean; settled: boolean },
) {
  const [terminalTab, setTerminalTab] = useState<TerminalTopTab>("terminal")
  const [stored, setStored] = usePersistentState(`huxflux:panes:${agentId}`, defaultVisibility, isVisibility)
  const visibility = hasDiff ? stored : withoutDiff(stored)
  // Updates see the same substituted state, so toggling Files closes what is on screen.
  const setVisibility = useCallback((update: (v: PaneVisibility) => PaneVisibility) => {
    setStored((v) => update(hasDiff ? v : withoutDiff(v)))
  }, [hasDiff, setStored])

  const hiddenKey = [...visibility.hidden, ...(hasPR ? [] : ["pr"])].sort().join(",")
  const visible = useMemo(() => {
    const hidden = hiddenKey.split(",")
    return new Set(paneOrder.filter((p) => !hidden.includes(p)))
  }, [hiddenKey])

  const dockRef = useRef<DockHandle | null>(null)
  /** Pane to bring to the front on the next reconcile, set when a pane is opened. */
  const pendingFocusRef = useRef<WorkspacePaneId | undefined>(undefined)

  const show = useCallback((pane: SidePaneId) => {
    const panel = dockRef.current?.api.getPanel(pane)
    if (panel) { panel.api.setActive(); return }
    pendingFocusRef.current = pane
    setVisibility((v) => ({ ...v, hidden: v.hidden.filter((p) => p !== pane) }))
  }, [setVisibility])

  const hide = useCallback((pane: SidePaneId) => {
    if (dockRef.current?.api.hasMaximizedGroup()) dockRef.current.api.exitMaximizedGroup()
    setVisibility((v) => ({ ...v, hidden: [...new Set([...v.hidden, pane])] }))
  }, [setVisibility])

  /** Opens a hidden pane, brings a background tab to the front, or hides a pane already in front. */
  const toggle = useCallback((pane: SidePaneId) => {
    const panel = dockRef.current?.api.getPanel(pane)
    if (panel && panel.group.activePanel?.id !== pane) panel.api.setActive()
    else if (visible.has(pane)) hide(pane)
    else show(pane)
  }, [visible, show, hide])

  const toggleMaximize = useCallback((pane: WorkspacePaneId) => {
    const handle = dockRef.current
    const panel = handle?.api.getPanel(pane)
    if (!handle || !panel) return
    if (panel.group.api.isMaximized()) handle.api.exitMaximizedGroup()
    else handle.api.maximizeGroup(panel)
  }, [])

  /** Records the maximized pane as the dock reports it; written as-is so a missing Diff is not substituted. */
  const setMaximized = useCallback((pane: WorkspacePaneId | undefined) => {
    setStored((v) => (v.maximized === pane ? v : { ...v, maximized: pane }))
  }, [setStored])

  const reset = useCallback(() => {
    if (dockRef.current) resetLayout(dockRef.current.api, visible, dockRef.current.container)
  }, [visible])

  useEffect(() => {
    const onMaximizeTerminal = () => {
      if (visible.has("terminal")) toggleMaximize("terminal")
      else show("terminal")
    }
    window.addEventListener("huxflux:toggle-terminal-maximize", onMaximizeTerminal)
    return () => window.removeEventListener("huxflux:toggle-terminal-maximize", onMaximizeTerminal)
  }, [visible, show, toggleMaximize])

  useSectionShortcuts(setVisibility, toggle)

  return {
    agentId,
    maximized: stored.maximized,
    setMaximized,
    terminalTab,
    setTerminalTab,
    visible,
    show,
    hide,
    toggle,
    toggleMaximize,
    reset,
    settled,
    dockRef,
    pendingFocusRef,
  }
}

export type AgentWorkspaceLayout = ReturnType<typeof useAgentWorkspaceLayout>
