import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { colorThemes, getColorTheme } from "@/lib/colorThemes"
import { openExternal } from "@/lib/platform"
import type { TerminalSession } from "./agents.types"
import { getPtyWsUrl, scanForPort } from "./utils"

/**
 * Module-level session store — survives component unmount/remount.
 * Key: `${agentId}:${terminalId}`.
 * Cleanup happens explicitly via `closeTerminalSession` when the user closes the tab.
 */
export const globalSessions = new Map<string, TerminalSession>()

/** Resolve the active color theme's terminal palette, with a stone-theme fallback. */
export function getTerminalTheme() {
  const id = getColorTheme()
  const theme = colorThemes.find((t) => t.id === id)
  return theme?.terminal ?? colorThemes[0].terminal
}

/** Return the existing session for `sessionKey`, or lazily construct a fresh xterm + addons. */
export function getOrCreateSession(sessionKey: string): TerminalSession {
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
  // Let F1 and Cmd+F propagate
  term.attachCustomKeyEventHandler((e) => {
    if (e.key === "F1") return false
    // Cmd+F / Ctrl+F: toggle search bar
    if ((e.metaKey || e.ctrlKey) && e.key === "f") return false
    return true
  })
  const fitAddon = new FitAddon()
  const searchAddon = new SearchAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.loadAddon(new WebLinksAddon((event, uri) => {
    if (event.metaKey || event.ctrlKey) openExternal(uri)
  }))

  const session: TerminalSession = {
    term,
    fitAddon,
    searchAddon,
    ws: null,
    div,
    port: null,
    isRunning: false,
    outputBuf: "",
    onDataDisposable: null,
  }
  globalSessions.set(sessionKey, session)
  return session
}

interface ConnectOptions {
  agentId: string
  terminalId: string
  session: TerminalSession
  fresh?: boolean
  onPortDetected?: (port: number) => void
}

/** Open the websocket for a session (idempotent — skips if already connecting/open). */
export function connectSession({ agentId, terminalId, session, fresh = false, onPortDetected }: ConnectOptions) {
  // Allow reconnect if WS is closed/closing; skip only if connecting or open
  if (session.ws && session.ws.readyState <= WebSocket.OPEN) return

  const ws = new WebSocket(getPtyWsUrl(agentId, terminalId, fresh))
  session.ws = ws

  ws.onopen = () => {
    const dims = session.fitAddon.proposeDimensions()
    if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }))
  }

  ws.onmessage = (ev) => handlePtyMessage(ev, session, onPortDetected)

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

function handlePtyMessage(
  ev: MessageEvent,
  session: TerminalSession,
  onPortDetected?: (port: number) => void,
) {
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
          onPortDetected?.(port)
        }
      }
    } else if (msg.type === "error") {
      session.term.writeln(`\r\n\x1b[31m${msg.message}\x1b[0m`)
    } else if (msg.type === "exit") {
      session.term.writeln(`\r\n\x1b[2m[process exited with code ${msg.exitCode}]\x1b[0m`)
    }
  } catch {
    /* ignore */
  }
}

/** Tear down a session: detach div, close websocket, dispose xterm + listener, drop from store. */
export function closeTerminalSession(sessionKey: string) {
  const session = globalSessions.get(sessionKey)
  if (!session) return
  session.div.parentElement?.removeChild(session.div)
  try {
    session.ws?.close()
  } catch {
    /* ignore */
  }
  session.onDataDisposable?.dispose()
  session.term.dispose()
  globalSessions.delete(sessionKey)
}
