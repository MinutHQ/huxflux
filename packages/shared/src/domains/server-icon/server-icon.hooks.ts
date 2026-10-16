import { useQuery } from "@tanstack/react-query"
import { serverAuthHeaders } from "../servers/servers.store.js"
import type { HuxfluxServer } from "../servers/servers.types.js"
import {
  generateServerIconBodySchema, generateServerIconResponseSchema, serverIconCapabilitiesSchema,
  type GenerateServerIconBody, type GenerateServerIconResponse,
} from "./server-icon.types.js"

// These talk to a SPECIFIC server rather than the active one, so a client can
// borrow whichever configured server has Codex installed.

async function fetchJson(server: HuxfluxServer, path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${server.url}${path}`, {
      ...init,
      headers: { ...serverAuthHeaders(server), ...(init.body ? { "Content-Type": "application/json" } : {}) },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${server.name}: HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function hasCodex(server: HuxfluxServer): Promise<boolean> {
  try {
    const parsed = serverIconCapabilitiesSchema.safeParse(await fetchJson(server, "/api/server-icon/capabilities", {}, 5000))
    return parsed.success && parsed.data.codex
  } catch {
    // Offline, unauthorized, or too old for the endpoint.
    return false
  }
}

/** Ask `server`'s Codex to draw an icon. */
export async function generateServerIconOn(server: HuxfluxServer, body: GenerateServerIconBody): Promise<GenerateServerIconResponse> {
  const json = await fetchJson(server, "/api/server-icon/generate", {
    method: "POST",
    body: JSON.stringify(generateServerIconBodySchema.parse(body)),
  }, 150_000)
  return generateServerIconResponseSchema.parse(json)
}

/**
 * Every configured server that can generate icons right now, probed in
 * parallel. Order follows `servers`; callers pick a preference.
 */
export function useIconGeneratorServers(servers: HuxfluxServer[]): HuxfluxServer[] {
  const key = servers.map((s) => `${s.id}|${s.url}`).join(",")
  const { data } = useQuery({
    queryKey: ["server-icon-generators", key],
    queryFn: async () => {
      const results = await Promise.all(servers.map(async (s) => ((await hasCodex(s)) ? s.id : null)))
      return results.filter((id): id is string => id !== null)
    },
    staleTime: 5 * 60_000,
  })
  const ids = new Set(data ?? [])
  return servers.filter((s) => ids.has(s.id))
}
