import { getStorage } from "./storage"

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export interface HiveServer {
  id: string
  name: string
  url: string
  token?: string
  addedAt: string
}

const SERVERS_KEY = "huxflux:servers"
const ACTIVE_KEY = "huxflux:active-server"

function getServersRaw(): HiveServer[] {
  try {
    const raw = getStorage().getItem(SERVERS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HiveServer[]
  } catch {
    return []
  }
}

// When served directly from the huxflux server, window.__HUXFLUX__ is injected
// into the page. Auto-register that server so the user skips onboarding.
function maybeAutoRegister() {
  try {
    const injected = (globalThis as any).__HUXFLUX__ as { url: string; token?: string } | undefined
    if (!injected?.url) return
    const existing = getServersRaw()
    const already = existing.find((s) => s.url === injected.url)
    if (already) {
      if (already.token !== injected.token) {
        saveServers(existing.map((s) => s.id === already.id ? { ...s, token: injected.token } : s))
      }
      if (!getActiveServerId()) setActiveServerId(already.id)
      return
    }
    const server: HiveServer = { id: uuid(), name: "Local", url: injected.url, token: injected.token, addedAt: new Date().toISOString() }
    saveServers([...existing, server])
    setActiveServerId(server.id)
  } catch { /* non-fatal */ }
}

export function getServers(): HiveServer[] {
  maybeAutoRegister()
  return getServersRaw()
}

function saveServers(servers: HiveServer[]): void {
  getStorage().setItem(SERVERS_KEY, JSON.stringify(servers))
}

export function addServer(s: Omit<HiveServer, "id" | "addedAt">): HiveServer {
  const server: HiveServer = {
    ...s,
    id: uuid(),
    addedAt: new Date().toISOString(),
  }
  saveServers([...getServers(), server])
  return server
}

export function updateServer(
  id: string,
  patch: Partial<Pick<HiveServer, "name" | "url" | "token">>
): void {
  saveServers(getServers().map((s) => (s.id === id ? { ...s, ...patch } : s)))
}

export function removeServer(id: string): void {
  saveServers(getServers().filter((s) => s.id !== id))
  if (getActiveServerId() === id) {
    const remaining = getServers()
    if (remaining.length > 0) {
      setActiveServerId(remaining[0].id)
    } else {
      getStorage().removeItem(ACTIVE_KEY)
    }
  }
}

export function getActiveServerId(): string | null {
  return getStorage().getItem(ACTIVE_KEY)
}

export function setActiveServerId(id: string): void {
  getStorage().setItem(ACTIVE_KEY, id)
}

export function getActiveServer(): HiveServer | null {
  const servers = getServers()
  const activeId = getActiveServerId()
  return servers.find((s) => s.id === activeId) ?? servers[0] ?? null
}

/** Parses a huxflux:// or http(s):// connection string into { url, token }. */
export function parseConnectionString(input: string): { url: string; token?: string } | null {
  try {
    const normalized = input.trim().replace(/^huxflux:\/\//, "http://")
    const parsed = new URL(normalized)
    const token = parsed.searchParams.get("token") ?? undefined
    parsed.searchParams.delete("token")
    return { url: parsed.origin, token }
  } catch {
    return null
  }
}
