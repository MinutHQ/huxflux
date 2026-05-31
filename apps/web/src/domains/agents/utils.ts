import { getActiveServer } from "@huxflux/shared"
import { ANSI_RE, PORT_PATTERNS, TERMINAL_ACTIVE_TAB_KEY } from "./config"

/** True when the active server is not `localhost`. Tauri + remote flips the header into SSH mode. */
export function isRemoteServer(): boolean {
  const server = getActiveServer()
  if (!server) return false
  try {
    const h = new URL(server.url).hostname
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1"
  } catch {
    return false
  }
}

/** Returns the first plausible port number found in recent terminal output, or `null`. */
export function scanForPort(buf: string): number | null {
  const clean = buf.replace(ANSI_RE, "")
  for (const re of PORT_PATTERNS) {
    const m = clean.match(re)
    if (m) {
      const port = parseInt(m[1])
      if (port >= 1024 && port <= 65535) return port
    }
  }
  return null
}

/** Build the websocket URL for the per-agent PTY. `fresh=1` asks the server to replay buffer. */
export function getPtyWsUrl(agentId: string, terminalId: string, fresh: boolean): string {
  const server = getActiveServer()
  const base = server?.url ?? "http://localhost:4321"
  const wsBase = base.replace(/^http/, "ws")
  const url = `${wsBase}/ws/pty/${agentId}?terminalId=${encodeURIComponent(terminalId)}${fresh ? "&fresh=1" : ""}`
  return server?.token ? `${url}&token=${server.token}` : url
}

/** Read the last-active terminal-tab id for `agentId`, returning `null` if missing or storage errors. */
export function getStoredActiveTabId(agentId: string): string | null {
  try {
    return localStorage.getItem(`${TERMINAL_ACTIVE_TAB_KEY}${agentId}`)
  } catch {
    return null
  }
}

/** Persist the last-active terminal-tab id for `agentId`. Errors are swallowed (private mode). */
export function setStoredActiveTabId(agentId: string, terminalId: string) {
  try {
    localStorage.setItem(`${TERMINAL_ACTIVE_TAB_KEY}${agentId}`, terminalId)
  } catch {
    /* ignore */
  }
}
