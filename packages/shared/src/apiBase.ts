// Cross-cutting HTTP helpers used by every domain api slice.
// Resolves the active server URL + auth headers and wraps fetch with
// timeout / error handling. Kept top-level (not inside a domain) because
// every domain's api.ts depends on it and it has no domain affinity.

import type { z } from "zod/v4"
import { getActiveServer } from "./domains/servers/servers.store.js"
import { apiErrorSchema, HuxfluxApiError } from "./error.js"

function getBase(): string {
  return getActiveServer()?.url ?? "http://localhost:4321"
}

export function getApiBase(): string {
  return getBase()
}

export function authHeaders(): Record<string, string> {
  const token = getActiveServer()?.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function req<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const hasBody = init?.body !== undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 15_000)
  let res: Response
  try {
    res = await fetch(`${getBase()}${path}`, {
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
        ...init?.headers,
      },
      signal: init?.signal ?? controller.signal,
      ...init,
    })
  } finally {
    clearTimeout(timer)
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
