import { useCallback, useEffect, useRef, useState } from "react"
import { useDefaultLayout } from "react-resizable-panels"

type MaximizedPane = "files" | "terminal" | null
type RightPane = "files" | "terminal"
type TerminalTab = "setup" | "run" | "terminal"

function readMaximized(agentId: string): MaximizedPane {
  try {
    const stored = localStorage.getItem(`huxflux:maximized:${agentId}`)
    return stored === "files" || stored === "terminal" ? stored : null
  } catch {
    return null
  }
}

function writeMaximized(agentId: string, next: MaximizedPane): void {
  try {
    if (next) localStorage.setItem(`huxflux:maximized:${agentId}`, next)
    else localStorage.removeItem(`huxflux:maximized:${agentId}`)
  } catch {
    /* storage unavailable */
  }
}

/**
 * Layout + visibility state for the per-agent workspace route.
 *
 * Owns:
 *  - terminal top-tab (setup / run / terminal)
 *  - maximized-pane toggle (files / terminal / none), persisted per agent
 *  - active right pane (drives the maximize target)
 *  - right-panel visibility (Cmd/Ctrl+U)
 *  - terminal-row visibility (Cmd/Ctrl+J)
 *  - the two `useDefaultLayout` invocations for the main + right resizable groups
 *  - the `huxflux:toggle-terminal-maximize` window event handler
 */
export function useAgentWorkspaceLayout(agentId: string) {
  const [terminalTab, setTerminalTab] = useState<TerminalTab>("terminal")
  const [maximizedPane, setMaximizedPane] = useState<MaximizedPane>(() => readMaximized(agentId))
  const [activeRightPane, setActiveRightPane] = useState<RightPane>("files")
  const [rightPanelVisible, setRightPanelVisible] = useState(true)
  const [terminalVisible, setTerminalVisible] = useState(true)

  // Reset maximized state when switching agents
  useEffect(() => {
    setMaximizedPane(readMaximized(agentId))
  }, [agentId])

  const mainLayout = useDefaultLayout({
    id: "huxflux-main",
    panelIds: ["huxflux-main-chat", "huxflux-main-right"],
  })
  const rightLayout = useDefaultLayout({
    id: "huxflux-right",
    panelIds: ["huxflux-right-files", "huxflux-right-terminal"],
  })

  // Mirror activeRightPane into a ref so `toggleMaximize` can read the
  // current value without taking it as a dep (which would recreate the
  // handler every time the user clicks into a different right-side pane).
  const activeRightPaneRef = useRef(activeRightPane)
  useEffect(() => { activeRightPaneRef.current = activeRightPane }, [activeRightPane])

  const toggleMaximize = useCallback(() => {
    setMaximizedPane((v) => {
      const next = v ? null : activeRightPaneRef.current
      writeMaximized(agentId, next)
      return next
    })
  }, [agentId])

  useEffect(() => {
    window.addEventListener("huxflux:toggle-terminal-maximize", toggleMaximize)
    return () => window.removeEventListener("huxflux:toggle-terminal-maximize", toggleMaximize)
  }, [toggleMaximize])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "u") {
        e.preventDefault()
        setRightPanelVisible((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault()
        setTerminalVisible((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return {
    terminalTab,
    setTerminalTab,
    maximizedPane,
    activeRightPane,
    setActiveRightPane,
    rightPanelVisible,
    setRightPanelVisible,
    terminalVisible,
    mainLayout,
    rightLayout,
  }
}
