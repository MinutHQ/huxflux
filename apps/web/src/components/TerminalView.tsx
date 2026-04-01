import { useRef, useEffect, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { cn } from "@hive/ui"
import type { Agent } from "@/data/mock"
import { IconTerminal2, IconPlayerPlay, IconPlayerPlayFilled, IconSettings, IconWorld, IconPlayerStop, IconPlus, IconX } from "@tabler/icons-react"
import { getActiveServer, useRepos } from "@hive/shared"
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
}

interface TerminalTab {
  id: string
  num: number
}

// Module-level session store — survives component unmount/remount
// Key: `${agentId}:${terminalId}`
const globalSessions = new Map<string, Session>()

function getPtyWsUrl(agentId: string): string {
  const server = getActiveServer()
  const base = server?.url ?? "http://localhost:3001"
  const wsBase = base.replace(/^http/, "ws")
  const url = `${wsBase}/ws/pty/${agentId}`
  return server?.token ? `${url}?token=${server.token}` : url
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

export function TerminalView({ agent, activeTab, onTabChange, onOpenSettings, onPortChange }: TerminalViewProps) {
  const { data: repos = [] } = useRepos()
  const repo = repos.find((r) => r.id === agent.repoId)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  const activeSessionKeyRef = useRef(`${agent.id}:t1`)
  const nextTerminalNumRef = useRef(2)

  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([{ id: "t1", num: 1 }])
  const [activeTerminalId, setActiveTerminalId] = useState("t1")
  const [isRunning, setIsRunning] = useState(false)
  const [detectedPort, setDetectedPort] = useState<number | null>(null)

  // Reset terminal tabs when agent changes
  useEffect(() => {
    nextTerminalNumRef.current = 2
    setTerminalTabs([{ id: "t1", num: 1 }])
    setActiveTerminalId("t1")
    activeSessionKeyRef.current = `${agent.id}:t1`
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
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    const session: Session = { term, fitAddon, ws: null, div, port: null, isRunning: false, outputBuf: "" }
    globalSessions.set(sessionKey, session)
    return session
  }

  function connectSession(agentId: string, session: Session) {
    if (session.ws) return

    const ws = new WebSocket(getPtyWsUrl(agentId))
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
      session.term.writeln("\r\n\x1b[2m[connection closed]\x1b[0m")
    }

    session.term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }))
    })
  }

  function activateSession(sessionKey: string, agentId: string) {
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
      connectSession(agentId, session)
    })
  }

  useEffect(() => {
    if (activeTab !== "terminal") return
    const key = `${agent.id}:${activeTerminalId}`
    activeSessionKeyRef.current = key
    activateSession(key, agent.id)
    const session = globalSessions.get(key)
    setIsRunning(session?.isRunning ?? false)
    setDetectedPort(session?.port ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, agent.id, activeTerminalId])

  // Update all terminal themes when color theme changes
  useEffect(() => {
    function handleThemeChange() {
      const theme = getTerminalTheme()
      for (const session of globalSessions.values()) {
        session.term.options.theme = theme
      }
    }
    window.addEventListener("hive:color-theme-change", handleThemeChange)
    return () => window.removeEventListener("hive:color-theme-change", handleThemeChange)
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

  function addTerminal() {
    const num = nextTerminalNumRef.current++
    const id = `t${num}`
    setTerminalTabs((prev) => [...prev, { id, num }])
    setActiveTerminalId(id)
  }

  function closeTerminal(id: string) {
    if (terminalTabs.length <= 1) return
    const sessionKey = `${agent.id}:${id}`
    const session = globalSessions.get(sessionKey)
    if (session) {
      session.div.parentElement?.removeChild(session.div)
      try { session.ws?.close() } catch { /* ignore */ }
      session.term.dispose()
      globalSessions.delete(sessionKey)
    }
    setTerminalTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (id === activeTerminalId) {
        const idx = prev.findIndex((t) => t.id === id)
        setActiveTerminalId(next[Math.min(idx, next.length - 1)].id)
      }
      return next
    })
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

  function handleStop() {
    const key = `${agent.id}:${activeTerminalId}`
    const session = globalSessions.get(key)
    if (session?.ws?.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: "input", data: "\x03" }))
    }
    if (session) {
      session.isRunning = false
      session.port = null
      session.outputBuf = ""
    }
    setIsRunning(false)
    setDetectedPort(null)
    onPortChange?.(agent.id, null)
  }

  return (
    <div className="flex flex-col h-full bg-background border-t border-border">
      {/* Top tab bar: Setup / Run / terminal tabs / + */}
      <div className="flex items-center px-3 border-b border-border shrink-0 bg-background">
        <div className="flex items-center flex-1 min-w-0">
          {(["setup", "run"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize -mb-px shrink-0",
                activeTab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "run" && <IconPlayerPlay size={12} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}

          {/* Terminal tabs */}
          {terminalTabs.map((tab) => {
            const isActive = activeTab === "terminal" && activeTerminalId === tab.id
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center border-b-2 -mb-px transition-colors",
                  isActive ? "border-foreground" : "border-transparent"
                )}
              >
                <button
                  onClick={() => { onTabChange("terminal"); setActiveTerminalId(tab.id) }}
                  className={cn(
                    "flex items-center gap-1.5 pl-3 pr-1.5 py-2 text-xs font-medium transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <IconTerminal2 size={12} />
                  {terminalTabs.length > 1 ? tab.num : "Terminal"}
                </button>
                {terminalTabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTerminal(tab.id) }}
                    className="pr-2 py-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    <IconX size={10} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Add terminal button */}
          <button
            onClick={() => { onTabChange("terminal"); addTerminal() }}
            className="flex items-center justify-center w-7 h-7 ml-0.5 text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
            title="New terminal"
          >
            <IconPlus size={12} />
          </button>
        </div>

        {repo?.runScript && (
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {isRunning ? (
              <>
                {detectedPort && (
                  <a
                    href={`http://localhost:${detectedPort}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <IconWorld size={11} className="text-emerald-400" />
                    Open
                    <span className="font-mono text-emerald-400">:{detectedPort}</span>
                  </a>
                )}
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
                >
                  <IconPlayerStop size={11} className="text-red-400" />
                  Stop
                  <kbd className="text-muted-foreground/50 font-mono text-[10px]">⌘R</kbd>
                </button>
              </>
            ) : (
              <button
                onClick={handleRun}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
              >
                <IconPlayerPlayFilled size={11} />
                Run
                <kbd className="text-muted-foreground/50 font-mono text-[10px]">⌘R</kbd>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={wrapperRef}
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
