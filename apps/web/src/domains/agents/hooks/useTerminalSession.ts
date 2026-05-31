import { useCallback, useEffect, useRef, useState } from "react"
import type { TerminalSession, TerminalTopTab } from "../agents.types"
import {
  connectSession,
  getOrCreateSession,
  getTerminalTheme,
  globalSessions,
} from "../terminalSession"

interface UseTerminalSessionArgs {
  agentId: string
  activeTerminalId: string
  activeTab: TerminalTopTab
  tabsLoaded: boolean
  onPortChange?: (agentId: string, port: number | null) => void
}

interface UseTerminalSessionResult {
  /** Ref callback to attach to the wrapper div so the xterm DOM node re-mounts. */
  wrapperRef: (node: HTMLDivElement | null) => void
  isRunning: boolean
  detectedPort: number | null
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>
  setDetectedPort: React.Dispatch<React.SetStateAction<number | null>>
}

interface ActivateArgs {
  sessionKey: string
  agentId: string
  terminalId: string
  wrapper: HTMLDivElement
  activeSessionKeyRef: React.RefObject<string>
  onPortChange?: (agentId: string, port: number | null) => void
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>
  setDetectedPort: React.Dispatch<React.SetStateAction<number | null>>
}

/** Attach the session DOM, evict others, and (re)open the websocket. */
function activateSession({
  sessionKey,
  agentId,
  terminalId,
  wrapper,
  activeSessionKeyRef,
  onPortChange,
  setIsRunning,
  setDetectedPort,
}: ActivateArgs) {
  const isNew = !globalSessions.has(sessionKey)
  const session = getOrCreateSession(sessionKey)

  for (const [key, s] of globalSessions.entries()) {
    if (key !== sessionKey) s.div.parentElement?.removeChild(s.div)
  }

  if (!session.div.parentElement) {
    wrapper.appendChild(session.div)
    if (isNew) session.term.open(session.div)
  }

  requestAnimationFrame(() => {
    session.fitAddon.fit()
    connectSession({
      agentId,
      terminalId,
      session,
      fresh: isNew,
      onPortDetected: (port) => {
        onPortChange?.(agentId, port)
        if (activeSessionKeyRef.current.startsWith(agentId + ":")) {
          setDetectedPort(port)
          setIsRunning(true)
        }
      },
    })
  })
}

/** Attach a fresh wrapper DOM node back to the session's existing terminal div. */
function reattachSessionTo(node: HTMLDivElement, session: TerminalSession) {
  node.appendChild(session.div)
  requestAnimationFrame(() => {
    session.fitAddon.fit()
    session.term.focus()
  })
}

/** Update every live terminal session to use the new color theme. */
function applyTerminalThemeToAll() {
  const theme = getTerminalTheme()
  for (const session of globalSessions.values()) {
    session.term.options.theme = theme
  }
}

/**
 * Owns the xterm session lifecycle for the currently visible tab.
 * Re-attaches DOM on remount, connects the websocket on tab/agent change,
 * resizes the PTY when the container resizes, and re-themes all live sessions
 * when the global color theme changes.
 */
export function useTerminalSession({
  agentId,
  activeTerminalId,
  activeTab,
  tabsLoaded,
  onPortChange,
}: UseTerminalSessionArgs): UseTerminalSessionResult {
  const wrapperDomRef = useRef<HTMLDivElement | null>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  const activeSessionKeyRef = useRef(`${agentId}:t1`)

  const [isRunning, setIsRunning] = useState(false)
  const [detectedPort, setDetectedPort] = useState<number | null>(null)

  // Re-attach the terminal session div when the wrapper DOM node changes
  // (e.g. when the component remounts due to maximize toggle)
  const wrapperRef = useCallback((node: HTMLDivElement | null) => {
    wrapperDomRef.current = node
    if (!node) return
    const session = globalSessions.get(activeSessionKeyRef.current)
    if (session && !session.div.parentElement) reattachSessionTo(node, session)
  }, [])

  useEffect(() => {
    if (activeTab !== "terminal" || !tabsLoaded) return
    const key = `${agentId}:${activeTerminalId}`
    activeSessionKeyRef.current = key
    const wrapper = wrapperDomRef.current
    if (wrapper) {
      activateSession({
        sessionKey: key,
        agentId,
        terminalId: activeTerminalId,
        wrapper,
        activeSessionKeyRef,
        onPortChange,
        setIsRunning,
        setDetectedPort,
      })
    }
    const session = globalSessions.get(key)
    setIsRunning(session?.isRunning ?? false)
    setDetectedPort(session?.port ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, agentId, activeTerminalId, tabsLoaded])

  useEffect(() => {
    window.addEventListener("huxflux:color-theme-change", applyTerminalThemeToAll)
    return () => window.removeEventListener("huxflux:color-theme-change", applyTerminalThemeToAll)
  }, [])

  useEffect(() => {
    if (!wrapperDomRef.current) return
    resizeObsRef.current = new ResizeObserver(() => {
      const session = globalSessions.get(activeSessionKeyRef.current)
      if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) return
      try {
        session.fitAddon.fit()
        const dims = session.fitAddon.proposeDimensions()
        if (dims) session.ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }))
      } catch { /* ignore */ }
    })
    resizeObsRef.current.observe(wrapperDomRef.current)
    return () => resizeObsRef.current?.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      for (const session of globalSessions.values()) {
        session.div.parentElement?.removeChild(session.div)
      }
    }
  }, [])

  return { wrapperRef, isRunning, detectedPort, setIsRunning, setDetectedPort }
}
