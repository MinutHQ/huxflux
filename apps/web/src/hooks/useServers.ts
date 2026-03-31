import { useState, useCallback } from "react"
import {
  getServers,
  addServer,
  updateServer,
  removeServer,
  getActiveServerId,
  setActiveServerId,
  type HiveServer,
} from "@/lib/serverStore"

export function useServers() {
  const [servers, setServers] = useState<HiveServer[]>(getServers)
  const [activeId, setActiveIdState] = useState<string | null>(getActiveServerId)

  const refresh = useCallback(() => {
    setServers(getServers())
    setActiveIdState(getActiveServerId())
  }, [])

  const add = useCallback(
    (s: Omit<HiveServer, "id" | "addedAt">): HiveServer => {
      const server = addServer(s)
      refresh()
      return server
    },
    [refresh]
  )

  const update = useCallback(
    (id: string, patch: Partial<Pick<HiveServer, "name" | "url" | "token">>) => {
      updateServer(id, patch)
      refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    (id: string) => {
      removeServer(id)
      refresh()
    },
    [refresh]
  )

  const setActive = useCallback(
    (id: string) => {
      setActiveServerId(id)
      window.location.reload()
    },
    []
  )

  const activeServer = servers.find((s) => s.id === activeId) ?? servers[0] ?? null

  return { servers, activeServer, activeId, setActive, add, update, remove, refresh }
}
