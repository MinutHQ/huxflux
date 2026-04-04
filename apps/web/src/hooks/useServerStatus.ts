import { useState, useEffect, useRef } from "react"
import type { HuxfluxServer } from "@huxflux/shared"

export type ServerStatus = "online" | "offline" | "checking"

async function checkHealth(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${url}/health`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function useServerStatus(
  servers: HuxfluxServer[]
): Record<string, ServerStatus> {
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>(() =>
    Object.fromEntries(servers.map((s) => [s.id, "checking" as ServerStatus]))
  )

  // Track the server list for changes
  const serverIdsRef = useRef<string[]>([])

  useEffect(() => {
    const ids = servers.map((s) => s.id).join(",")
    const prevIds = serverIdsRef.current.join(",")

    if (ids !== prevIds) {
      serverIdsRef.current = servers.map((s) => s.id)
      // Mark new servers as checking
      setStatuses((prev) => {
        const next = { ...prev }
        for (const s of servers) {
          if (!(s.id in next)) next[s.id] = "checking"
        }
        // Remove stale entries
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
      const results = await Promise.all(
        servers.map(async (s) => ({ id: s.id, online: await checkHealth(s.url) }))
      )
      if (cancelled) return
      setStatuses((prev) => {
        const next = { ...prev }
        for (const r of results) {
          next[r.id] = r.online ? "online" : "offline"
        }
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
