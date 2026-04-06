import { getStorage } from "./storage"

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export interface HuxfluxServer {
  id: string
  name: string
  url: string
  token?: string
  addedAt: string
}

const SERVERS_KEY = "huxflux:servers"
const ACTIVE_KEY = "huxflux:active-server"

function getServersRaw(): HuxfluxServer[] {
  try {
    const raw = getStorage().getItem(SERVERS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HuxfluxServer[]
  } catch {
    return []
  }
}

export function getServers(): HuxfluxServer[] {
  return getServersRaw()
}

function notifyChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("huxflux:servers-changed"))
  }
}

function saveServers(servers: HuxfluxServer[]): void {
  getStorage().setItem(SERVERS_KEY, JSON.stringify(servers))
  notifyChange()
}

export function addServer(s: Omit<HuxfluxServer, "id" | "addedAt">): HuxfluxServer {
  const existing = getServers()
  const normalizedUrl = s.url.replace(/\/$/, "")
  const duplicate = existing.find((srv) => srv.url.replace(/\/$/, "") === normalizedUrl)
  if (duplicate) {
    // Update token if changed and return existing entry
    if (s.token && duplicate.token !== s.token) {
      updateServer(duplicate.id, { token: s.token })
      return { ...duplicate, token: s.token }
    }
    return duplicate
  }
  const server: HuxfluxServer = {
    ...s,
    url: normalizedUrl,
    id: uuid(),
    addedAt: new Date().toISOString(),
  }
  saveServers([...existing, server])
  return server
}

export function updateServer(
  id: string,
  patch: Partial<Pick<HuxfluxServer, "name" | "url" | "token">>
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
  notifyChange()
}

export function getActiveServer(): HuxfluxServer | null {
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
