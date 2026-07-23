// Cross-cutting HTTP helpers used by every domain api slice.
// Resolves the active server URL + auth headers and wraps fetch with
// timeout / error handling. Kept top-level (not inside a domain) because
// every domain's api.ts depends on it and it has no domain affinity.

import type { z } from "zod/v4"
import { getActiveServer, updateServer, isProxiedServer, proxyOriginOf, serverAuthHeaders } from "./domains/servers/servers.store.js"
import { refreshProxyToken } from "./domains/proxy/proxyAuth.js"
import { apiErrorSchema, HuxfluxApiError } from "./error.js"

function getBase(): string {
  return getActiveServer()?.url ?? "http://localhost:4321"
}

export function getApiBase(): string {
  return getBase()
}

export function authHeaders(): Record<string, string> {
  // Proxied servers authenticate to the proxy with the access JWT on a distinct
  // header; direct servers use their bearer token. Delegated to the per-server
  // helper so every call site attaches the right credential consistently.
  return serverAuthHeaders(getActiveServer())
}

async function doFetch(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const hasBody = init?.body !== undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 15_000)
  const { headers: initHeaders, signal: initSignal, timeoutMs: _t, ...rest } = init ?? {}
  try {
    return await fetch(`${getBase()}${path}`, {
      ...rest,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
        ...initHeaders,
      },
      signal: initSignal ?? controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

// Coalesce concurrent refreshes so a burst of 401s triggers a single exchange.
let refreshInFlight: Promise<boolean> | null = null

async function tryRefreshActiveProxyToken(): Promise<boolean> {
  const server = getActiveServer()
  if (!server || !isProxiedServer(server) || !server.proxyRefreshToken) return false
  const origin = proxyOriginOf(server.url)
  if (!origin) return false
  const refreshToken = server.proxyRefreshToken
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const token = await refreshProxyToken(origin, refreshToken)
      if (!token) return false
      updateServer(server.id, {
        proxyAccessToken: token.accessToken,
        ...(token.refreshToken ? { proxyRefreshToken: token.refreshToken } : {}),
      })
      return true
    })().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

export async function req<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let res = await doFetch(path, init)
  // A proxied server's access token may have expired — refresh once and retry.
  if (res.status === 401 && (await tryRefreshActiveProxyToken())) {
    res = await doFetch(path, init)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as unknown
    const parsed = apiErrorSchema.safeParse(body)
    if (parsed.success) {
      throw new HuxfluxApiError(res.status, parsed.data.code, parsed.data.message, parsed.data.details)
    }
    // Legacy fallback: routes that still emit { error: "string" } directly
    // instead of going through the global error handler. Drops away once
    // every route is migrated to the structured shape.
    const legacy = body as { error?: string }
    throw new Error(legacy.error ?? `${init?.method ?? "GET"} ${path} → ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Variant of `req()` that runs the response body through a Zod schema. Use
// this from every domain `api.ts` so the client refuses to silently accept
// a server response that drifted from the agreed shape.
export async function reqValidated<T extends z.ZodTypeAny>(
  schema: T,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<z.infer<T>> {
  const raw = await req<unknown>(path, init)
  return schema.parse(raw)
}
