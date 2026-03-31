export interface HiveServer {
  id: string
  name: string
  url: string
  token?: string
  addedAt: string
}

const SERVERS_KEY = "huxflux:servers"
const ACTIVE_KEY = "huxflux:active-server"

export function getServers(): HiveServer[] {
  try {
    const raw = localStorage.getItem(SERVERS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HiveServer[]
  } catch {
    return []
  }
}

function saveServers(servers: HiveServer[]): void {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers))
}

export function addServer(s: Omit<HiveServer, "id" | "addedAt">): HiveServer {
  const server: HiveServer = {
    ...s,
    id: crypto.randomUUID(),
    addedAt: new Date().toISOString(),
  }
  const servers = getServers()
  saveServers([...servers, server])
  return server
}

export function updateServer(
  id: string,
  patch: Partial<Pick<HiveServer, "name" | "url" | "token">>
): void {
  const servers = getServers().map((s) => (s.id === id ? { ...s, ...patch } : s))
  saveServers(servers)
}

export function removeServer(id: string): void {
  saveServers(getServers().filter((s) => s.id !== id))
  if (getActiveServerId() === id) {
    const remaining = getServers()
    if (remaining.length > 0) {
      setActiveServerId(remaining[0].id)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
  }
}

export function getActiveServerId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveServerId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

// Parses a huxflux:// connection string into { url, token }.
// Also accepts plain http(s):// URLs (token will be undefined).
export function parseConnectionString(input: string): { url: string; token?: string } | null {
  try {
    const normalized = input.trim().replace(/^huxflux:\/\//, "http://")
    const parsed = new URL(normalized)
    const token = parsed.searchParams.get("token") ?? undefined
    parsed.searchParams.delete("token")
    const url = parsed.origin
    return { url, token }
  } catch {
    return null
  }
}
