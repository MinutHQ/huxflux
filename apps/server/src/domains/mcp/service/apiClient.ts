import type { FastifyInstance } from "fastify"
import { config } from "../../../config.js"

export interface ApiResult<T = unknown> {
  ok: boolean
  status: number
  data: T
}

/**
 * Calls one of the server's own REST routes in-process via Fastify's request
 * injection. Every MCP tool goes through here so it hits the exact same
 * validation, auth hook and handlers as the web and mobile clients. Nothing
 * is re-implemented for MCP; the tools are a thin adapter over the HTTP API.
 */
export async function callApi<T = unknown>(
  app: FastifyInstance,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { authorization: `Bearer ${config.authToken}` }
  if (body !== undefined) headers["content-type"] = "application/json"
  const res = await app.inject({
    method,
    url,
    headers,
    payload: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: unknown = null
  try {
    data = res.body ? res.json() : null
  } catch {
    data = res.body
  }
  return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: data as T }
}

/** Pulls a human-readable message out of an error response body. */
export function describeApiError(result: ApiResult): string {
  const data = result.data as { error?: string; message?: string } | string | null
  if (typeof data === "string" && data) return data
  if (data && typeof data === "object") return data.error ?? data.message ?? JSON.stringify(data)
  return `HTTP ${result.status}`
}
