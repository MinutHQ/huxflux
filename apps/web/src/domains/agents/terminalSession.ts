import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { colorThemes, getColorTheme } from "@/lib/colorThemes"
import { openExternal } from "@/lib/platform"
import type { TerminalSession, TerminalSessionTarget } from "./agents.types"
import { getPtyWsUrl, scanForPort } from "./utils"

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15_000
const isMacUserAgent = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)

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

/**
 * The terminal search shortcut: Cmd+F on macOS, Ctrl+Shift+F elsewhere.
 * Plain Ctrl+F is left to the shell (readline forward-char).
 */
export function isTerminalSearchShortcut(e: KeyboardEvent | React.KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== "f") return false
  return isMacUserAgent ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey
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
  // Let F1 and the search shortcut propagate to the app
  term.attachCustomKeyEventHandler((e) => {
    if (e.key === "F1") return false
    if (isTerminalSearchShortcut(e)) return false
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
    target: null,
    exited: false,
    fatal: false,
    disposed: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    pendingInput: [],
    sentSize: null,
  }
  session.onDataDisposable = term.onData((data) => sendInput(session, data))
  globalSessions.set(sessionKey, session)
  return session
}

/** Open the websocket for a session (idempotent — skips if already connecting/open). */
export function connectSession(session: TerminalSession, target: TerminalSessionTarget) {
  session.target = target
  openSocket(session)
}

/**
 * Send keystrokes (or a command) to the PTY. Queued while the socket is
 * connecting. After the shell exited, the next call starts a new shell; the
 * keystroke that restarts it is dropped unless `keepOnRestart` (Run) is set.
 */
export function sendInput(session: TerminalSession, data: string, keepOnRestart = false) {
  if (session.exited) {
    if (keepOnRestart) session.pendingInput.push(data)
    openSocket(session)
    return
  }
  const ws = session.ws
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "input", data }))
    return
  }
  // Queue only during the first connect (e.g. Run before the socket opened).
  // Keys typed while reconnecting are dropped so they never run in a new shell.
  if (!session.fatal && session.reconnectAttempts === 0) session.pendingInput.push(data)
}

/** Fit xterm to its container and tell the PTY the new size. No-op while hidden. */
export function syncSize(session: TerminalSession) {
  if (!session.div.isConnected || session.div.clientWidth === 0 || session.div.clientHeight === 0) return
  try {
    session.fitAddon.fit()
  } catch {
    return
  }
  const size = `${session.term.cols}x${session.term.rows}`
  const ws = session.ws
  if (ws?.readyState !== WebSocket.OPEN || size === session.sentSize) return
  ws.send(JSON.stringify({ type: "resize", cols: session.term.cols, rows: session.term.rows }))
  session.sentSize = size
}

function openSocket(session: TerminalSession) {
  const target = session.target
  if (!target || session.disposed) return
  if (session.ws && session.ws.readyState <= WebSocket.OPEN) return
  clearReconnect(session)
  session.exited = false
  session.fatal = false
  let opened = false

  // Always ask for a replay: the server sends it as a "replay" frame and the
  // client resets the screen first, so reconnects pick up missed output.
  const ws = new WebSocket(getPtyWsUrl(target.agentId, target.terminalId, true))
  session.ws = ws

  ws.onopen = () => {
    opened = true
    session.sentSize = null
    syncSize(session)
    for (const data of session.pendingInput.splice(0)) {
      ws.send(JSON.stringify({ type: "input", data }))
    }
  }

  ws.onmessage = (ev) => {
    // Reset backoff on the first frame, not on open, so a server that accepts
    // and immediately drops the socket still backs off.
    session.reconnectAttempts = 0
    handlePtyMessage(ev, session)
  }

  ws.onclose = () => {
    // A newer socket may already have replaced this one; leave it alone.
    if (session.ws !== ws) return
    session.ws = null
    // Input queued for a socket that never opened must not run whenever the
    // server comes back.
    if (!opened) session.pendingInput = []
    if (session.disposed || session.fatal || session.exited) return
    if (session.reconnectAttempts === 0) writeNotice(session, "[connection lost, reconnecting…]")
    scheduleReconnect(session)
  }
}

function scheduleReconnect(session: TerminalSession) {
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** session.reconnectAttempts, RECONNECT_MAX_MS)
  session.reconnectAttempts += 1
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null
    // Only the visible terminal reconnects on its own. Hidden ones reconnect
    // when activated, so a server restart does not respawn every visited shell.
    if (session.div.isConnected) openSocket(session)
  }, delay)
}

function clearReconnect(session: TerminalSession) {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer)
  session.reconnectTimer = null
}

function writeNotice(session: TerminalSession, text: string) {
  session.term.writeln(`\r\n\x1b[2m${text}\x1b[0m`)
}

function handlePtyMessage(ev: MessageEvent, session: TerminalSession) {
  try {
    const msg = JSON.parse(ev.data)
    if (msg.type === "replay") {
      session.term.reset()
      writeOutput(session, msg.data)
    } else if (msg.type === "output") {
      writeOutput(session, msg.data)
    } else if (msg.type === "error") {
      session.fatal = true
      session.pendingInput = []
      session.term.writeln(`\r\n\x1b[31m${msg.message}\x1b[0m`)
    } else if (msg.type === "closed") {
      session.fatal = true
      session.pendingInput = []
      writeNotice(session, "[terminal closed]")
    } else if (msg.type === "exit") {
      markExited(session, msg.exitCode)
    }
  } catch {
    /* ignore */
  }
}

/** Drop the dead socket right away so the next keystroke can start a new shell. */
function markExited(session: TerminalSession, exitCode: number) {
  session.exited = true
  session.pendingInput = []
  const ws = session.ws
  session.ws = null
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  writeNotice(session, `[process exited with code ${exitCode}]`)
  writeNotice(session, "[press any key to start a new shell]")
}

function writeOutput(session: TerminalSession, data: string) {
  session.term.write(data)
  if (session.port) return
  session.outputBuf = (session.outputBuf + data).slice(-2000)
  const port = scanForPort(session.outputBuf)
  if (port) {
    session.port = port
    session.isRunning = true
    session.target?.onPortDetected?.(port)
  }
}

/** Tear down a session: detach div, close websocket, dispose xterm + listener, drop from store. */
export function closeTerminalSession(sessionKey: string) {
  const session = globalSessions.get(sessionKey)
  if (!session) return
  session.disposed = true
  clearReconnect(session)
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
