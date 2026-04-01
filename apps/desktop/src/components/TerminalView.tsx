import { useRef, useEffect, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { cn } from "@hive/ui"
import type { Agent } from "@/data/mock"
import { IconTerminal2, IconPlayerPlay, IconPlayerPlayFilled, IconSettings, IconWorld, IconPlayerStop } from "@tabler/icons-react"
import { getActiveServer, useRepos } from "@hive/shared"
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
  outputBuf: string  // rolling buffer for port detection
}

// Module-level session store — survives component unmount/remount
const globalSessions = new Map<string, Session>()

function getPtyWsUrl(agentId: string): string {
  const server = getActiveServer()
  const base = server?.url ?? "http://localhost:3001"
  const wsBase = base.replace(/^http/, "ws")
  const url = `${wsBase}/ws/pty/${agentId}`
  return server?.token ? `${url}?token=${server.token}` : url
}

// Strip ANSI escape codes so port patterns aren't broken by color codes
const ANSI_RE = /\x1b\[[0-9;]*[mGKHF]|\x1b\][^\x07]*\x07|\r/g

function scanForPort(buf: string): number | null {
  const clean = buf.replace(ANSI_RE, "")
  // Match common server-ready output patterns:
  // - "localhost:3000" / "127.0.0.1:3000" / "0.0.0.0:3000"
  // - "Local:   http://localhost:3000"
  // - "listening on port 3000"
  // - "started server on 0.0.0.0:3000"
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

const TERMINAL_THEME = {
  background: "#1c1917",
  foreground: "#e7e5e4",
  cursor: "#e7e5e4",
  selectionBackground: "#44403c",
  black: "#1c1917", red: "#f87171", green: "#4ade80", yellow: "#facc15",
  blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#e7e5e4",
  brightBlack: "#78716c", brightRed: "#fca5a5", brightGreen: "#86efac",
  brightYellow: "#fde047", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9", brightWhite: "#fafaf9",
}

export function TerminalView({ agent, activeTab, onTabChange, onOpenSettings, onPortChange }: TerminalViewProps) {
  const { data: repos = [] } = useRepos()
  const repo = repos.find((r) => r.id === agent.repoId)

  // Wrapper that holds all per-agent terminal divs
  const wrapperRef = useRef<HTMLDivElement>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)

  // Local UI state derived from the active session
  const [isRunning, setIsRunning] = useState(false)
  const [detectedPort, setDetectedPort] = useState<number | null>(null)

  function getOrCreateSession(agentId: string): Session {
    const existing = globalSessions.get(agentId)
    if (existing) return existing

    const div = document.createElement("div")
    div.style.cssText = "position:absolute;inset:0;padding:4px;"

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"Geist Mono", "JetBrains Mono", "Fira Code", monospace',
      theme: TERMINAL_THEME,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    const session: Session = { term, fitAddon, ws: null, div, port: null, isRunning: false, outputBuf: "" }
    globalSessions.set(agentId, session)
    return session
  }

  function connectSession(agentId: string, session: Session) {
    if (session.ws) return // already connected

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
          // Scan a rolling buffer for port patterns (handles split chunks + ANSI codes)
          if (!session.port) {
            session.outputBuf = (session.outputBuf + msg.data).slice(-2000)
            const port = scanForPort(session.outputBuf)
            if (port) {
              session.port = port
              // Auto-mark as running whether started via Run button or typed manually
              session.isRunning = true
              onPortChange?.(agentId, port)
              if (agentId === agent.id) {
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

  // Activate a session: attach its div to wrapper, open terminal if new, connect WS
  function activateSession(agentId: string) {
    if (!wrapperRef.current) return

    const isNew = !globalSessions.has(agentId)
    const session = getOrCreateSession(agentId)

    // Detach all other session divs — only the active one lives in the DOM
    for (const [id, s] of globalSessions.entries()) {
      if (id !== agentId) s.div.parentElement?.removeChild(s.div)
    }

    // Attach active session div if not already there
    if (!session.div.parentElement) {
      wrapperRef.current.appendChild(session.div)
      if (isNew) {
        session.term.open(session.div)
      }
    }

    // Fit and connect
    requestAnimationFrame(() => {
      session.fitAddon.fit()
      connectSession(agentId, session)
    })
  }

  // Activate/switch session whenever the terminal tab is active or the agent changes
  useEffect(() => {
    if (activeTab !== "terminal") return
    activateSession(agent.id)
    const session = globalSessions.get(agent.id)
    setIsRunning(session?.isRunning ?? false)
    setDetectedPort(session?.port ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, agent.id])

  // Resize observer on wrapper — resize the active session
  useEffect(() => {
    if (!wrapperRef.current) return
    resizeObsRef.current = new ResizeObserver(() => {
      const session = globalSessions.get(agent.id)
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

  // On unmount: detach all session divs from the wrapper DOM node.
  // Sessions (Terminal + WS) remain alive in globalSessions for when we remount.
  useEffect(() => {
    return () => {
      for (const session of globalSessions.values()) {
        session.div.parentElement?.removeChild(session.div)
      }
    }
  }, [])

  function handleRun() {
    if (!repo?.runScript) return
    onTabChange("terminal")
    const session = getOrCreateSession(agent.id)
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
    const session = globalSessions.get(agent.id)
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
    <div className="flex flex-col h-full bg-[#1c1917] border-t border-border">
      {/* Tab bar */}
      <div className="flex items-center px-3 border-b border-border shrink-0 bg-background">
        <div className="flex items-center flex-1 min-w-0">
          {(["setup", "run", "terminal"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize -mb-px",
                activeTab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "terminal" && <IconTerminal2 size={12} />}
              {tab === "run" && <IconPlayerPlay size={12} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
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
        {/* Wrapper holds all per-agent terminal divs (appended imperatively) */}
        <div
          ref={wrapperRef}
          className="absolute inset-0"
        />

        {activeTab === "run" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-[#1c1917] z-10">
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
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-sm bg-[#1c1917] z-10">
            Setup output appears here during agent creation
          </div>
        )}
      </div>
    </div>
  )
}
