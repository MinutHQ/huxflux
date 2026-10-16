import { useQuery } from "@tanstack/react-query"
import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from "react"
import { api } from "../../api.js"
import { queryKeys } from "../../queryKeys.js"
import {
  serverAuthHeaders, subscribeServers, getServersSnapshot, parseServersSnapshot,
} from "./servers.store.js"
import { serverAttentionSchema, type HuxfluxServer, type ServerAttention, type ServerStatus } from "./servers.types.js"

export interface ServersStoreState {
  servers: HuxfluxServer[]
  activeId: string | null
  activeServer: HuxfluxServer | null
}

/**
 * Reactive view of the server registry. Re-renders on every mutation through
 * the store (add / update / remove / set active) and on any storage change that
 * alters the raw snapshot, such as async hydration on mobile.
 */
export function useServersStore(): ServersStoreState {
  const snapshot = useSyncExternalStore(subscribeServers, getServersSnapshot, getServersSnapshot)
  return useMemo(() => {
    const { servers, activeId } = parseServersSnapshot(snapshot)
    const activeServer = servers.find((s) => s.id === activeId) ?? servers[0] ?? null
    return { servers, activeId, activeServer }
  }, [snapshot])
}

/** The active server, or the first one, or null. Reactive. */
export function useActiveServer(): HuxfluxServer | null {
  return useServersStore().activeServer
}

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
  // Proxied servers gate /health behind the proxy too, so every probe must
  // carry the server's auth header (proxy JWT or direct bearer).
  const headers = serverAuthHeaders(server)
  // Reachability is determined solely by /health.
  try {
    const healthRes = await fetchWithTimeout(`${server.url}/health`, { headers }, 5000)
    if (healthRes.status === 401 || healthRes.status === 403) return "unauthorized"
    if (!healthRes.ok) return "offline"
  } catch {
    return "offline"
  }
  // Server is reachable. Check auth on its own budget — a failure here must
  // not report the server as offline; only an explicit 401/403 is unauthorized.
  try {
    const authRes = await fetchWithTimeout(`${server.url}/api/config`, { headers }, 5000)
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

export function useServerConfig() {
  const { data } = useQuery({
    queryKey: queryKeys.settings.serverConfig(),
    queryFn: () => api.settings.serverConfig(),
    staleTime: 60_000,
  })
  return {
    githubEnabled: data?.githubEnabled ?? false,
    feedbackEnabled: data?.feedbackEnabled ?? false,
  }
}

async function fetchAttention(server: HuxfluxServer): Promise<ServerAttention | null> {
  try {
    const res = await fetchWithTimeout(`${server.url}/api/attention`, { headers: serverAuthHeaders(server) }, 5000)
    // 404 means the server predates the endpoint; show no badge rather than an error.
    if (!res.ok) return null
    const parsed = serverAttentionSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Polls every server's GET /api/attention so switchers can badge servers with
 * agents waiting on the user. A server that is offline, unauthorized, or too
 * old for the endpoint maps to null. Backed by one TanStack query keyed on the
 * server list, so every mounted switcher shares a single poll; it also
 * refetches on window focus so badges are fresh when the user comes back.
 */
export function useServerAttention(servers: HuxfluxServer[], intervalMs = 10_000): Record<string, ServerAttention | null> {
  const key = servers.map((s) => `${s.id}|${s.url}`).join(",")
  const { data } = useQuery({
    queryKey: ["server-attention", key],
    queryFn: async () => {
      const results = await Promise.all(servers.map(async (s) => [s.id, await fetchAttention(s)] as const))
      return Object.fromEntries(results) as Record<string, ServerAttention | null>
    },
    enabled: servers.length > 0,
    refetchInterval: intervalMs,
  })
  return data ?? {}
}
