import { useState, useEffect, useRef } from "react"
import type { HiveServer } from "../serverStore"

export type ServerStatus = "online" | "offline" | "checking" | "unauthorized"

async function checkStatus(server: HiveServer): Promise<ServerStatus> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const healthRes = await fetch(`${server.url}/health`, { signal: controller.signal })
    if (!healthRes.ok) return "offline"
    const authRes = await fetch(`${server.url}/api/config`, {
      headers: server.token ? { Authorization: `Bearer ${server.token}` } : {},
      signal: controller.signal,
    })
    if (authRes.status === 401 || authRes.status === 403) return "unauthorized"
    return "online"
  } catch {
    return "offline"
  } finally {
    clearTimeout(timer)
  }
}

export function useServerStatus(servers: HiveServer[]): Record<string, ServerStatus> {
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>(() =>
    Object.fromEntries(servers.map((s) => [s.id, "checking" as ServerStatus]))
  )

  const serverIdsRef = useRef<string[]>([])

  useEffect(() => {
    const ids = servers.map((s) => s.id).join(",")
    const prevIds = serverIdsRef.current.join(",")

    if (ids !== prevIds) {
      serverIdsRef.current = servers.map((s) => s.id)
      setStatuses((prev) => {
        const next = { ...prev }
        for (const s of servers) {
          if (!(s.id in next)) next[s.id] = "checking"
        }
        for (const id of Object.keys(next)) {
          if (!servers.find((s) => s.id === id)) delete next[id]
        }
        return next
      })
    }

    if (servers.length === 0) return

    let cancelled = false

    async function poll() {
      if (cancelled) return
      const results = await Promise.all(servers.map(async (s) => ({ id: s.id, status: await checkStatus(s) })))
      if (cancelled) return
      setStatuses((prev) => {
        const next = { ...prev }
        for (const r of results) next[r.id] = r.status
        return next
      })
    }

    poll()
    const interval = setInterval(poll, 20_000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers.map((s) => s.id).join(",")])

  return statuses
}
