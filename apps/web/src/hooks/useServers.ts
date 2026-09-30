import { useState, useCallback, useEffect } from "react"
import { isTauri } from "@/lib/platform"
import {
  getServers,
  addServer,
  updateServer,
  removeServer,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
  subscribeServers,
  type HuxfluxServer,
} from "@huxflux/shared"

const ROUTES_KEY = "huxflux-server-routes"

// The route (agent, task, etc.) last open on each server, keyed by server id,
// so switching back lands where the user left off instead of on a route that
// points at the other server's data.
function loadServerRoutes(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ROUTES_KEY) ?? "{}")
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeServerRoutes(routes: Record<string, string>): void {
  try {
    localStorage.setItem(ROUTES_KEY, JSON.stringify(routes))
  } catch {
    // localStorage unavailable, switching still works without the memory.
  }
}

// Tauri uses hash history (route lives in the hash), the browser uses paths.
function currentRoute(): string {
  const { pathname, search, hash } = window.location
  return isTauri ? hash || "#/" : `${pathname}${search}`
}

function isSettingsRoute(route: string): boolean {
  return route.replace(/^#/, "").startsWith("/settings")
}

// Swap the URL without a router navigation, then reload so the WS and query
// cache reconnect to the new server. A hash-only assign would not reload.
function reloadAtRoute(route: string): void {
  window.history.replaceState(null, "", route)
  window.location.reload()
}

export function useServers() {
  const [servers, setServers] = useState<HuxfluxServer[]>(getServers)
  const [activeId, setActiveIdState] = useState<string | null>(getActiveServerId)

  const refresh = useCallback(() => {
    setServers(getServers())
    setActiveIdState(getActiveServerId())
  }, [])

  // Keep all useServers instances in sync via the store subscription
  useEffect(() => subscribeServers(refresh), [refresh])

  const add = useCallback(
    (s: Omit<HuxfluxServer, "id" | "addedAt">): HuxfluxServer => {
      const server = addServer(s)
      // refresh is handled by the store subscription
      return server
    },
    []
  )

  const update = useCallback(
    (id: string, patch: Partial<Pick<HuxfluxServer, "name" | "url" | "token">>) => {
      updateServer(id, patch)
      // Reload if connection details changed so WS reconnects with new settings
      if (patch.url !== undefined || patch.token !== undefined) {
        window.location.reload()
      }
      // refresh handled by event
    },
    []
  )

  const remove = useCallback((id: string) => {
    const wasActive = getActiveServerId() === id
    removeServer(id)
    const { [id]: _forgotten, ...routes } = loadServerRoutes()
    writeServerRoutes(routes)
    const remaining = getServers()
    if (remaining.length === 0) {
      // No servers left — reload to trigger onboarding
      window.location.reload()
    } else if (wasActive) {
      // Active server removed — reload to reconnect WS
      window.location.reload()
    } else {
      // Non-active removed — just refresh state
      refresh()
    }
  }, [refresh])

  const setActive = useCallback((id: string) => {
    const prev = getActiveServer()
    setActiveServerId(id)
    // Reload only when switching to a different server URL so WS reconnects
    const next = getServers().find((s) => s.id === id)
    if (prev?.url === next?.url) return
    const route = currentRoute()
    // Switching from Settings stays in Settings; its route is not per-server.
    if (isSettingsRoute(route)) {
      window.location.reload()
      return
    }
    const routes = loadServerRoutes()
    if (prev) writeServerRoutes({ ...routes, [prev.id]: route })
    reloadAtRoute(routes[id] ?? (isTauri ? "#/" : "/"))
  }, [])

  const activeServer = servers.find((s) => s.id === activeId) ?? servers[0] ?? null

  return { servers, activeServer, activeId, setActive, add, update, remove, refresh }
}
