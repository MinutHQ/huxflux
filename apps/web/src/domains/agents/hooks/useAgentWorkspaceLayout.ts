import { useCallback, useEffect, useState } from "react"
import { useDefaultLayout } from "react-resizable-panels"
import { usePersistentState } from "@/hooks/usePersistentState"
import type { SidePaneLayout, SidePaneSection, TerminalTopTab } from "../agents.types"

const defaultLayout: SidePaneLayout = { top: "diff", lastTop: "diff", terminal: true, maximized: null }

const sections: readonly string[] = ["diff", "files", "pr"]

function isLayout(raw: unknown): raw is SidePaneLayout {
  if (!raw || typeof raw !== "object") return false
  const r = raw as Record<string, unknown>
  return (r.top === null || sections.includes(String(r.top)))
    && sections.includes(String(r.lastTop))
    && typeof r.terminal === "boolean"
    && (r.maximized === null || r.maximized === "top" || r.maximized === "terminal")
}

function withoutDiff(l: SidePaneLayout): SidePaneLayout {
  if (l.top !== "diff" && l.lastTop !== "diff") return l
  return { ...l, top: l.top === "diff" ? "files" : l.top, lastTop: l.lastTop === "diff" ? "files" : l.lastTop }
}

function isPosition(raw: unknown): raw is "right" | "bottom" {
  return raw === "right" || raw === "bottom"
}

/**
 * Layout state for the per-agent workspace: chat on the left, one side pane
 * on the right with a top section (Diff / Files / PR, one at a time) and an
 * optional terminal stacked under it. Persisted per agent.
 *
 * Shortcuts: Cmd/Ctrl+U toggles the top section (reopening the last one),
 * Cmd/Ctrl+J toggles the terminal. `huxflux:toggle-terminal-maximize`
 * maximizes the terminal. With `hasDiff` false (a folder, not a git repo)
 * the Diff section is replaced by Files.
 */
export function useAgentWorkspaceLayout(agentId: string, { hasDiff }: { hasDiff: boolean }) {
  const [terminalTab, setTerminalTab] = useState<TerminalTopTab>("terminal")
  const [storedLayout, setStoredLayout] = usePersistentState(`huxflux:side-pane:${agentId}`, defaultLayout, isLayout)
  // Outside a git repo there is nothing to diff: show Files wherever Diff would be.
  // Updates see the same substituted layout, so toggling Files closes what is on screen.
  const layout = hasDiff ? storedLayout : withoutDiff(storedLayout)
  const setLayout = useCallback((update: (l: SidePaneLayout) => SidePaneLayout) => {
    setStoredLayout((l) => update(hasDiff ? l : withoutDiff(l)))
  }, [hasDiff, setStoredLayout])
  const [terminalPosition, setTerminalPosition] = usePersistentState<"right" | "bottom">("huxflux:terminal-position", "right", isPosition)

  const mainLayout = useDefaultLayout({ id: "huxflux-main", panelIds: ["huxflux-main-chat", "huxflux-main-side"] })
  const sideLayout = useDefaultLayout({ id: "huxflux-side", panelIds: ["huxflux-side-top", "huxflux-side-terminal"] })

  const openTop = useCallback((section: SidePaneSection) => {
    setLayout((l) => ({ ...l, top: section, lastTop: section }))
  }, [setLayout])

  const toggleTop = useCallback((section: SidePaneSection) => {
    setLayout((l) => (l.top === section
      ? { ...l, top: null, maximized: l.maximized === "top" ? null : l.maximized }
      : { ...l, top: section, lastTop: section }))
  }, [setLayout])

  const closeTop = useCallback(() => {
    setLayout((l) => ({ ...l, top: null, maximized: l.maximized === "top" ? null : l.maximized }))
  }, [setLayout])

  const toggleTerminal = useCallback(() => {
    setLayout((l) => ({ ...l, terminal: !l.terminal, maximized: l.maximized === "terminal" ? null : l.maximized }))
  }, [setLayout])

  const toggleMaximize = useCallback((which: "top" | "terminal") => {
    setLayout((l) => ({ ...l, maximized: l.maximized === which ? null : which }))
  }, [setLayout])

  useEffect(() => {
    const onMaximizeTerminal = () => toggleMaximize("terminal")
    window.addEventListener("huxflux:toggle-terminal-maximize", onMaximizeTerminal)
    return () => window.removeEventListener("huxflux:toggle-terminal-maximize", onMaximizeTerminal)
  }, [toggleMaximize])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === "u") {
        e.preventDefault()
        setLayout((l) => (l.top ? { ...l, top: null } : { ...l, top: l.lastTop }))
      }
      if (e.key === "j") {
        e.preventDefault()
        toggleTerminal()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setLayout, toggleTerminal])

  return {
    terminalTab,
    setTerminalTab,
    layout,
    openTop,
    toggleTop,
    closeTop,
    toggleTerminal,
    toggleMaximize,
    terminalPosition,
    setTerminalPosition,
    mainLayout,
    sideLayout,
  }
}

export type AgentWorkspaceLayout = ReturnType<typeof useAgentWorkspaceLayout>
