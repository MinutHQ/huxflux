import { useRef, useEffect, useState, useCallback } from "react"
import { Terminal } from "@xterm/xterm"
import type { IDisposable } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { cn } from "@huxflux/ui"
import type { Agent } from "@/data/mock"
import { IconTerminal2, IconPlayerPlayFilled, IconSettings, IconPlus, IconX } from "@tabler/icons-react"
import { getActiveServer, useRepos, api } from "@huxflux/shared"
import { colorThemes, getColorTheme } from "@/lib/colorThemes"
import "@xterm/xterm/css/xterm.css"

interface TerminalViewProps {
  agent: Agent
  activeTab: "setup" | "run" | "terminal"
  onTabChange: (tab: "setup" | "run" | "terminal") => void
  onOpenSettings: () => void
  onPortChange?: (agentId: string, port: number | null) => void
}

interface Session {
  term: Terminal
  fitAddon: FitAddon
  ws: WebSocket | null
  div: HTMLDivElement
  port: number | null
  isRunning: boolean
  outputBuf: string
  onDataDisposable: IDisposable | null
}

interface TerminalTab {
  id: string        // row id from DB
  terminalId: string // PTY key suffix
  orderIdx: number
  label?: string
}

// Module-level session store — survives component unmount/remount
// Key: `${agentId}:${terminalId}`
const globalSessions = new Map<string, Session>()

function getPtyWsUrl(agentId: string, terminalId: string, fresh: boolean): string {
  const server = getActiveServer()
  const base = server?.url ?? "http://localhost:4321"
  const wsBase = base.replace(/^http/, "ws")
  const url = `${wsBase}/ws/pty/${agentId}?terminalId=${encodeURIComponent(terminalId)}${fresh ? "&fresh=1" : ""}`
  return server?.token ? `${url}&token=${server.token}` : url
}

const ANSI_RE = /\x1b\[[0-9;]*[mGKHF]|\x1b\][^\x07]*\x07|\r/g

function scanForPort(buf: string): number | null {
  const clean = buf.replace(ANSI_RE, "")
  const patterns = [
    /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/,
    /(?:port|PORT)[^\d]*(\d{4,5})/,
    /:(\d{4,5})\//,
  ]
  for (const re of patterns) {
    const m = clean.match(re)
    if (m) {
      const port = parseInt(m[1])
      if (port >= 1024 && port <= 65535) return port
    }
  }
  return null
}

function getTerminalTheme() {
  const id = getColorTheme()
  const theme = colorThemes.find((t) => t.id === id)
  return theme?.terminal ?? colorThemes[0].terminal
}

function getStoredActiveTabId(agentId: string): string | null {
  try { return localStorage.getItem(`huxflux-terminal-active-${agentId}`) } catch { return null }
}

function setStoredActiveTabId(agentId: string, terminalId: string) {
  try { localStorage.setItem(`huxflux-terminal-active-${agentId}`, terminalId) } catch { /* ignore */ }
}

export function TerminalView({ agent, activeTab, onTabChange, onOpenSettings, onPortChange }: TerminalViewProps) {
  const { data: repos = [] } = useRepos()
  const repo = repos.find((r) => r.id === agent.repoId)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  const activeSessionKeyRef = useRef(`${agent.id}:t1`)

  // Re-attach the terminal session div when the wrapper DOM node changes
  // (e.g. when the component remounts due to maximize toggle)
  const wrapperCallbackRef = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node
    if (!node) return
    const key = activeSessionKeyRef.current
    const session = globalSessions.get(key)
    if (session && !session.div.parentElement) {
      node.appendChild(session.div)
      requestAnimationFrame(() => {
        session.fitAddon.fit()
        session.term.focus()
      })
    }
  }, [])

  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string>("t1")
  const [tabsLoaded, setTabsLoaded] = useState(false)
  const [_isRunning, setIsRunning] = useState(false)
  const [_detectedPort, setDetectedPort] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Load tabs from server when agent changes
  useEffect(() => {
    setTabsLoaded(false)
    api.getTerminalTabs(agent.id).then((rows) => {
      const tabs: TerminalTab[] = rows
        .sort((a, b) => a.orderIdx - b.orderIdx)
        .map((r) => ({ id: r.id, terminalId: r.terminalId, orderIdx: r.orderIdx, label: r.label ?? undefined }))

      // Fall back to a single default tab if server returned nothing
      const resolved = tabs.length > 0 ? tabs : [{ id: "default", terminalId: "t1", orderIdx: 0 }]
      setTerminalTabs(resolved)

      // Restore last-active tab from localStorage, defaulting to first tab
      const storedActive = getStoredActiveTabId(agent.id)
      const activeExists = resolved.some((t) => t.terminalId === storedActive)
      const activeId = activeExists ? storedActive! : resolved[0].terminalId
      setActiveTerminalId(activeId)
      activeSessionKeyRef.current = `${agent.id}:${activeId}`
      setTabsLoaded(true)
    }).catch(() => {
      setTerminalTabs([{ id: "default", terminalId: "t1", orderIdx: 0 }])
      setActiveTerminalId("t1")
      activeSessionKeyRef.current = `${agent.id}:t1`
      setTabsLoaded(true)
    })
  }, [agent.id])

  function getOrCreateSession(sessionKey: string): Session {
    const existing = globalSessions.get(sessionKey)
    if (existing) return existing

    const div = document.createElement("div")
    div.style.cssText = "position:absolute;inset:0;padding:4px;"

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"Geist Mono", "JetBrains Mono", "Fira Code", monospace',
      theme: getTerminalTheme(),
    })
    // Let F1 propagate to the window handler (for terminal maximize toggle)
    term.attachCustomKeyEventHandler((e) => {
      if (e.key === "F1") return false
      return true
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    const session: Session = { term, fitAddon, ws: null, div, port: null, isRunning: false, outputBuf: "", onDataDisposable: null }
    globalSessions.set(sessionKey, session)
    return session
  }

  function connectSession(agentId: string, terminalId: string, session: Session, fresh = false) {
    // Allow reconnect if WS is closed/closing; skip only if connecting or open
    if (session.ws && session.ws.readyState <= WebSocket.OPEN) return

    const ws = new WebSocket(getPtyWsUrl(agentId, terminalId, fresh))
    session.ws = ws

    ws.onopen = () => {
      const dims = session.fitAddon.proposeDimensions()
      if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }))
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === "output") {
          session.term.write(msg.data)
          if (!session.port) {
            session.outputBuf = (session.outputBuf + msg.data).slice(-2000)
            const port = scanForPort(session.outputBuf)
            if (port) {
              session.port = port
              session.isRunning = true
              onPortChange?.(agentId, port)
              if (activeSessionKeyRef.current.startsWith(agentId + ":")) {
                setDetectedPort(port)
                setIsRunning(true)
              }
            }
          }
        } else if (msg.type === "error") {
          session.term.writeln(`\r\n\x1b[31m${msg.message}\x1b[0m`)
        } else if (msg.type === "exit") {
          session.term.writeln(`\r\n\x1b[2m[process exited with code ${msg.exitCode}]\x1b[0m`)
        }
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      session.ws = null  // allow reconnection on next activateSession call
      session.term.writeln("\r\n\x1b[2m[connection closed]\x1b[0m")
    }

    // Dispose any previous onData listener before registering a new one
    session.onDataDisposable?.dispose()
    session.onDataDisposable = session.term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }))
    })
  }

  function activateSession(sessionKey: string, agentId: string, terminalId: string) {
    if (!wrapperRef.current) return

    const isNew = !globalSessions.has(sessionKey)
    const session = getOrCreateSession(sessionKey)

    for (const [key, s] of globalSessions.entries()) {
      if (key !== sessionKey) s.div.parentElement?.removeChild(s.div)
    }

    if (!session.div.parentElement) {
      wrapperRef.current.appendChild(session.div)
      if (isNew) {
        session.term.open(session.div)
      }
    }

    requestAnimationFrame(() => {
      session.fitAddon.fit()
      // fresh=true when the xterm was just created — server should replay output buffer
      connectSession(agentId, terminalId, session, isNew)
    })
  }

  useEffect(() => {
    if (activeTab !== "terminal" || !tabsLoaded) return
    const key = `${agent.id}:${activeTerminalId}`
    activeSessionKeyRef.current = key
    activateSession(key, agent.id, activeTerminalId)
    const session = globalSessions.get(key)
    setIsRunning(session?.isRunning ?? false)
    setDetectedPort(session?.port ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, agent.id, activeTerminalId, tabsLoaded])

  // Update all terminal themes when color theme changes
  useEffect(() => {
    function handleThemeChange() {
      const theme = getTerminalTheme()
      for (const session of globalSessions.values()) {
        session.term.options.theme = theme
      }
    }
    window.addEventListener("huxflux:color-theme-change", handleThemeChange)
    return () => window.removeEventListener("huxflux:color-theme-change", handleThemeChange)
  }, [])

  useEffect(() => {
    if (!wrapperRef.current) return
    resizeObsRef.current = new ResizeObserver(() => {
      const session = globalSessions.get(activeSessionKeyRef.current)
      if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) return
      try {
        session.fitAddon.fit()
        const dims = session.fitAddon.proposeDimensions()
        if (dims) session.ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }))
      } catch { /* ignore */ }
    })
    resizeObsRef.current.observe(wrapperRef.current)
    return () => resizeObsRef.current?.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      for (const session of globalSessions.values()) {
        session.div.parentElement?.removeChild(session.div)
      }
    }
  }, [])

  async function addTerminal() {
    try {
      const created = await api.createTerminalTab(agent.id)
      const newTab: TerminalTab = {
        id: created.id,
        terminalId: created.terminalId,
        orderIdx: created.orderIdx,
        label: created.label ?? undefined,
      }
      setTerminalTabs((prev) => [...prev, newTab])
      setActiveTerminalId(created.terminalId)
      setStoredActiveTabId(agent.id, created.terminalId)
      onTabChange("terminal")
    } catch { /* ignore — user can retry */ }
  }

  function startRename(tab: TerminalTab) {
    const displayNum = terminalTabs.findIndex((t) => t.terminalId === tab.terminalId) + 1
    setRenamingId(tab.terminalId)
    setRenameValue(tab.label ?? `Terminal ${displayNum}`)
    setTimeout(() => { renameInputRef.current?.select() }, 0)
  }

  function commitRename() {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    const newLabel = trimmed || null
    setTerminalTabs((prev) => prev.map((t) =>
      t.terminalId === renamingId ? { ...t, label: newLabel ?? undefined } : t
    ))
    setRenamingId(null)
    // Persist to server (fire-and-forget)
    api.updateTerminalTab(agent.id, renamingId, { label: newLabel }).catch(() => { /* ignore */ })
  }

  function closeTerminal(terminalId: string) {
    if (terminalTabs.length <= 1) return

    // Update local state immediately for responsiveness
    setTerminalTabs((prev) => {
      const next = prev.filter((t) => t.terminalId !== terminalId)
      if (terminalId === activeTerminalId) {
        const idx = prev.findIndex((t) => t.terminalId === terminalId)
        const nextActive = next[Math.min(idx, next.length - 1)].terminalId
        setActiveTerminalId(nextActive)
        setStoredActiveTabId(agent.id, nextActive)
      }
      return next
    })

    // Clean up local session
    const sessionKey = `${agent.id}:${terminalId}`
    const session = globalSessions.get(sessionKey)
    if (session) {
      session.div.parentElement?.removeChild(session.div)
      try {
        session.ws?.close()
      } catch { /* ignore */ }
      session.onDataDisposable?.dispose()
      session.term.dispose()
      globalSessions.delete(sessionKey)
    }

    // Delete from server (also kills PTY process on server)
    api.deleteTerminalTab(agent.id, terminalId).catch(() => { /* ignore */ })
  }

  function handleTabSelect(terminalId: string) {
    onTabChange("terminal")
    setActiveTerminalId(terminalId)
    setStoredActiveTabId(agent.id, terminalId)
  }

  function handleRun() {
    if (!repo?.runScript) return
    onTabChange("terminal")
    const key = `${agent.id}:${activeTerminalId}`
    const session = getOrCreateSession(key)
    session.isRunning = true
    session.port = null
    setIsRunning(true)
    setDetectedPort(null)
    onPortChange?.(agent.id, null)
    setTimeout(() => {
      if (session.ws?.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ type: "input", data: repo.runScript + "\r" }))
      }
    }, 300)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top tab bar */}
      <div className="relative flex items-center px-2 pb-1.5 pt-1 shrink-0 gap-1">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-foreground/[0.04] to-transparent pointer-events-none" />
        <div className="flex items-center flex-1 min-w-0 gap-1 relative">
          {/* Terminal tabs */}
          {terminalTabs.map((tab, idx) => {
            const isActive = activeTab === "terminal" && activeTerminalId === tab.terminalId
            const isRenaming = renamingId === tab.terminalId
            const displayLabel = tab.label ?? `Terminal ${idx + 1}`
            return (
              <div
                key={tab.terminalId}
                onClick={() => handleTabSelect(tab.terminalId)}
                onDoubleClick={(e) => { e.preventDefault(); startRename(tab) }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors cursor-pointer shrink-0",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
                )}
              >
                <IconTerminal2 size={12} className="shrink-0" />
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename()
                      if (e.key === "Escape") setRenamingId(null)
                      e.stopPropagation()
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent outline-none border-none text-[12px] font-medium w-20 min-w-0"
                    autoFocus
                  />
                ) : (
                  <span className="max-w-[100px] truncate">{displayLabel}</span>
                )}
                {terminalTabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTerminal(tab.terminalId) }}
                    className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    <IconX size={10} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Add terminal button */}
          <button
            onClick={addTerminal}
            className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            title="New terminal"
          >
            <IconPlus size={13} />
          </button>
        </div>

      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={wrapperCallbackRef}
          className="absolute inset-0"
        />

        {activeTab === "run" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-background z-10">
            {repo?.runScript ? (
              <>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">Run script</p>
                  <p className="text-[11px] font-mono text-muted-foreground/60 bg-card border border-border rounded px-2 py-1 max-w-xs truncate">
                    {repo.runScript}
                  </p>
                </div>
                <button
                  onClick={handleRun}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
                >
                  <IconPlayerPlayFilled size={12} />
                  Run
                </button>
              </>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">No run script configured</p>
                  <p className="text-[12px] text-muted-foreground/60">Add a run script to the repository settings</p>
                </div>
                <button
                  onClick={onOpenSettings}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-accent/60 transition-colors"
                >
                  <IconSettings size={13} />
                  Open settings
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === "setup" && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-sm bg-background z-10">
            Setup output appears here during agent creation
          </div>
        )}
      </div>
    </div>
  )
}
