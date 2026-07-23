import type { TunnelFrameHeader } from "@huxflux/shared/proxy"

type SendFrame = (header: TunnelFrameHeader, payload?: Uint8Array) => void

// Hop-by-hop / length headers the response must not carry back across the
// tunnel — the proxy re-frames the body itself. `content-encoding` is stripped
// because undici transparently decodes the loopback response, so the bytes we
// forward are already identity.
const STRIP_RESPONSE = new Set([
  "connection", "keep-alive", "transfer-encoding", "content-length",
  "content-encoding", "proxy-authenticate", "trailer", "upgrade",
])

// Returns an ArrayBuffer-backed view so it satisfies `fetch`'s BodyInit (a
// generic Uint8Array<ArrayBufferLike> could be SharedArrayBuffer-backed and is
// not assignable).
function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

function responseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (!STRIP_RESPONSE.has(key.toLowerCase())) out[key] = value
  })
  return out
}

export interface LoopbackHttpStream {
  pushChunk(payload: Uint8Array): void
  end(): Promise<void>
  abort(): void
}

// Replays one tunneled HTTP request against the local server over the loopback
// interface, then streams the response back as tunnel frames. The request body
// is buffered (Huxflux API bodies are small); the response is streamed.
export function createLoopbackHttpStream(
  base: string,
  id: number,
  header: Extract<TunnelFrameHeader, { t: "http-open" }>,
  send: SendFrame,
  loopbackToken?: string,
): LoopbackHttpStream {
  const chunks: Uint8Array[] = []
  const controller = new AbortController()
  let aborted = false
  // The remote client authenticated to the proxy, not to this server. Supply
  // the server's own token on the loopback leg so its auth hook still passes.
  const headers = loopbackToken
    ? { ...header.headers, authorization: `Bearer ${loopbackToken}` }
    : header.headers

  return {
    pushChunk(payload) { chunks.push(payload) },

    abort() {
      aborted = true
      controller.abort()
    },

    async end() {
      if (aborted) return
      const method = header.method.toUpperCase()
      const hasBody = method !== "GET" && method !== "HEAD" && chunks.length > 0
      try {
        const res = await fetch(base + header.path, {
          method,
          headers,
          body: hasBody ? concat(chunks) : undefined,
          signal: controller.signal,
          redirect: "manual",
        })
        send({ t: "http-res", id, status: res.status, headers: responseHeaders(res.headers) })
        if (res.body) {
          const reader = res.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (value && value.length > 0) send({ t: "http-res-chunk", id }, value)
          }
        }
        send({ t: "http-res-end", id })
      } catch (err) {
        if (aborted) return
        send({ t: "http-abort", id, reason: err instanceof Error ? err.message : "loopback fetch failed" })
      }
    },
  }
}
