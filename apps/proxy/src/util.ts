import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http"
import type { Duplex } from "node:stream"
import { SERVER_PREFIX, PROXY_AUTH_HEADER } from "@huxflux/shared/proxy"

/** Normalize whatever `ws` / Node hands us for a message body into a Uint8Array. */
export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) {
    // ws hands fragmented messages as an array of Buffers.
    const parts = data.map((d) => toUint8Array(d))
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) { out.set(p, offset); offset += p.length }
    return out
  }
  if (typeof data === "string") return new TextEncoder().encode(data)
  return new Uint8Array(0)
}

export interface ParsedServerPath {
  serverId: string
  /** Path + query with the `/s/<serverId>` prefix stripped, always starting with "/". */
  upstreamPath: string
}

/** Split `/s/<serverId>/rest?query` into its server id and the upstream path. */
export function parseServerPath(rawUrl: string): ParsedServerPath | null {
  if (!rawUrl.startsWith(SERVER_PREFIX)) return null
  const afterPrefix = rawUrl.slice(SERVER_PREFIX.length)
  let end = afterPrefix.length
  for (let i = 0; i < afterPrefix.length; i++) {
    const c = afterPrefix[i]
    if (c === "/" || c === "?") { end = i; break }
  }
  const serverId = afterPrefix.slice(0, end)
  if (!serverId) return null
  let rest = afterPrefix.slice(end)
  if (rest === "") rest = "/"
  else if (rest.startsWith("?")) rest = `/${rest}`
  return { serverId, upstreamPath: rest }
}

/** The path portion of a URL, without the query string. */
export function pathOf(rawUrl: string): string {
  const q = rawUrl.indexOf("?")
  return q === -1 ? rawUrl : rawUrl.slice(0, q)
}

// Hop-by-hop / connection-specific headers that must never be forwarded across
// the tunnel. The loopback fetch / ws client regenerate these for their own leg.
const STRIP_REQUEST = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "content-length",
  // Force identity encoding on the loopback leg so the tunneled bytes match the
  // headers we forward (undici would otherwise transparently decode gzip).
  "accept-encoding",
  // The proxy-level access token never travels on to the server; the proxy
  // consumes it and the connector supplies the server's own token instead.
  PROXY_AUTH_HEADER,
])

const STRIP_RESPONSE = new Set([
  "connection", "keep-alive", "transfer-encoding", "content-length",
  "content-encoding", "proxy-authenticate", "trailer", "upgrade",
])

export function sanitizeRequestHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (STRIP_REQUEST.has(key.toLowerCase())) continue
    out[key] = Array.isArray(value) ? value.join(", ") : value
  }
  return out
}

export function sanitizeResponseHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (STRIP_RESPONSE.has(key.toLowerCase())) continue
    out[key] = value
  }
  return out
}

/** Send a plain proxy-generated error (server offline, bad path, unauthorized). */
export function sendError(res: ServerResponse, code: number, message: string): void {
  const body = JSON.stringify({ error: message })
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    // Proxy-level errors need CORS so the browser client can read the status.
    "access-control-allow-origin": "*",
  })
  res.end(body)
}

/** Reject a WebSocket upgrade before the handshake completes. */
export function rejectUpgrade(socket: Duplex, code: number, message: string): void {
  socket.write(
    `HTTP/1.1 ${code} ${message}\r\n` +
    `Connection: close\r\n` +
    `Content-Length: 0\r\n\r\n`
  )
  socket.destroy()
}

/** Extract the proxy access token from the REST header or the WS query param. */
export function extractProxyToken(req: IncomingMessage): string | null {
  const header = req.headers[PROXY_AUTH_HEADER]
  const raw = Array.isArray(header) ? header[0] : header
  if (raw?.startsWith("Bearer ")) return raw.slice(7)
  try {
    const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("proxy_token")
    if (token) return token
  } catch { /* malformed url */ }
  return null
}

/** Remove a single query param from a `/path?a=1&b=2` string. */
export function stripQueryParam(path: string, key: string): string {
  const q = path.indexOf("?")
  if (q === -1) return path
  const params = new URLSearchParams(path.slice(q + 1))
  params.delete(key)
  const rest = params.toString()
  return rest ? `${path.slice(0, q)}?${rest}` : path.slice(0, q)
}

// ── OAuth endpoint response helpers ──────────────────────────────────────────

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { return {} }
}

export function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  const body = JSON.stringify(obj)
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
  })
  res.end(body)
}

export function sendHtml(res: ServerResponse, code: number, html: string): void {
  res.writeHead(code, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html) })
  res.end(html)
}

export function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location })
  res.end()
}
