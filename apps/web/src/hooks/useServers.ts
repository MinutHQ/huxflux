import { useState, useCallback, useEffect } from "react"
import {
  getServers,
  addServer,
  updateServer,
  removeServer,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
  type HuxfluxServer,
} from "@huxflux/shared"

export function useServers() {
  const [servers, setServers] = useState<HuxfluxServer[]>(getServers)
  const [activeId, setActiveIdState] = useState<string | null>(getActiveServerId)

  const refresh = useCallback(() => {
    setServers(getServers())
    setActiveIdState(getActiveServerId())
  }, [])

  // Keep all useServers instances in sync via the serverStore event
  useEffect(() => {
    window.addEventListener("huxflux:servers-changed", refresh)
    return () => window.removeEventListener("huxflux:servers-changed", refresh)
  }, [refresh])

  const add = useCallback(
    (s: Omit<HuxfluxServer, "id" | "addedAt">): HuxfluxServer => {
      const server = addServer(s)
      // refresh is handled by the huxflux:servers-changed event
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
    if (prev?.url !== next?.url) window.location.reload()
  }, [])

  const activeServer = servers.find((s) => s.id === activeId) ?? servers[0] ?? null

  return { servers, activeServer, activeId, setActive, add, update, remove, refresh }
}
