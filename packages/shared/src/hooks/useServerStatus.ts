import { useState, useEffect, useRef } from "react"
import type { HuxfluxServer } from "../serverStore"

export type ServerStatus = "online" | "offline" | "checking" | "unauthorized"

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function checkStatus(server: HuxfluxServer): Promise<ServerStatus> {
  // Reachability is determined solely by /health.
  try {
    const healthRes = await fetchWithTimeout(`${server.url}/health`, {}, 5000)
    if (!healthRes.ok) return "offline"
  } catch {
    return "offline"
  }
  // Server is reachable. Check auth on its own budget — a failure here must
  // not report the server as offline; only an explicit 401/403 is unauthorized.
  try {
    const authRes = await fetchWithTimeout(`${server.url}/api/config`, {
      headers: server.token ? { Authorization: `Bearer ${server.token}` } : {},
    }, 5000)
    if (authRes.status === 401 || authRes.status === 403) return "unauthorized"
  } catch {
    // Transient auth-check failure — server is reachable, treat as online.
  }
  return "online"
}

export function useServerStatus(servers: HuxfluxServer[]): Record<string, ServerStatus> {
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
