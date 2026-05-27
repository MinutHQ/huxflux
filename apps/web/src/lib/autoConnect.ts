import { getServers, addServer, setActiveServerId, updateServer } from "@huxflux/shared"

declare global {
  interface Window {
    __huxflux_connection?: string
  }
}

/**
 * Synchronous auto-connect from connection.json data injected by Tauri's setup hook.
 * Called from beforeLoad (before React mounts) to prevent the onboarding flash.
 */
export function tryAutoConnectSync(): void {
  const raw = window.__huxflux_connection
  if (!raw) return

  try {
    const conn = JSON.parse(raw) as { url: string; token: string }
    if (!conn.url) return

    const isLocalUrl = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(u)
    const getPort = (u: string) => { const m = u.match(/:(\d+)/); return m ? m[1] : "80" }
    const normalizeUrl = (u: string) => u.replace("://localhost", "://127.0.0.1")
    const existing = getServers()
    const connPort = getPort(conn.url)

    const already = existing.find((s) => {
      if (normalizeUrl(s.url) === normalizeUrl(conn.url)) return true
      if (isLocalUrl(s.url) && isLocalUrl(conn.url) && getPort(s.url) === connPort) return true
      return false
    })

    if (already) {
      // Update token/URL if changed
      const updates: { token?: string; url?: string } = {}
      if (already.token !== conn.token) updates.token = conn.token
      if (already.url !== conn.url) updates.url = conn.url
      if (Object.keys(updates).length > 0) updateServer(already.id, updates)
      return
    }

    const hasAutoConnected = localStorage.getItem("huxflux-auto-connected") === "1"

    if (!hasAutoConnected) {
      const server = addServer({ name: "Local Server", url: conn.url, token: conn.token })
      setActiveServerId(server.id)
      localStorage.setItem("huxflux-auto-connected", "1")
    } else {
      // Store for UI hint in ServerSwitcher
      localStorage.setItem("huxflux-local-server", JSON.stringify(conn))
    }
  } catch { /* malformed JSON */ }
}
