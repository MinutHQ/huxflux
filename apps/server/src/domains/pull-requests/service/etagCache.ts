// Conditional-request cache for the shared Octokit client. GitHub does not
// count a `304 Not Modified` against the primary rate limit, so replaying the
// last ETag on every GET makes unchanged resources free to re-check. The poller
// hits the same handful of endpoints per agent every cycle, which is exactly
// the shape this pays off for.
//
// It sits at the fetch layer, below every Octokit hook, and turns a 304 back
// into a 200 carrying the cached body. That keeps three things true for every
// caller: the request log never sees a 304 "error", rate-limit and date headers
// come from the live 304 (so quota readouts stay current), and each caller
// parses its own copy of the body (so one caller mutating `data` cannot corrupt
// what the next one gets). Bodies are validated server-side on every call:
// GitHub only answers 304 when the resource is identical to what we hold.

type Fetch = typeof globalThis.fetch

export interface EtagCacheLimits {
  /** Responses larger than this are never cached (diffs, raw file content). */
  maxEntryBytes: number
  /** Least recently used entries are evicted once the cache exceeds this. */
  maxTotalBytes: number
}

const defaultLimits: EtagCacheLimits = {
  maxEntryBytes: 512 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
}

// Headers describing the stored body. A 304 never contributes these: its own
// values (if any) describe an empty body.
const bodyHeaders = new Set(["content-length", "content-encoding", "transfer-encoding"])

// Statuses that mean the resource itself is gone, so the cached copy is dead.
// Anything else that is not a 200 (403/429 rate limits, 5xx) is transient and
// leaves the entry in place, so the poller resumes after a limit with a warm cache.
const goneStatuses = new Set([404, 410])

interface CachedEntry {
  etag: string
  body: ArrayBuffer
  headers: Headers
}

function getRequestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

function buildRequestHeaders(input: string | URL | Request, init: RequestInit | undefined): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
  return headers
}

// Start from the cached 200 (so Link, content-type and friends survive the
// replay; RFC 7232 lets a 304 omit them) and overlay the live 304, which
// carries the current rate-limit, date and etag values.
function buildReplayHeaders(cached: Headers, live: Headers): Headers {
  const headers = new Headers()
  cached.forEach((value, name) => {
    if (!bodyHeaders.has(name)) headers.set(name, value)
  })
  live.forEach((value, name) => {
    if (!bodyHeaders.has(name)) headers.set(name, value)
  })
  return headers
}

function exceedsLimit(response: Response, maxEntryBytes: number): boolean {
  const declared = Number(response.headers.get("content-length"))
  return Number.isFinite(declared) && declared > maxEntryBytes
}

/**
 * Wrap `baseFetch` so every GET replays its last ETag as If-None-Match and a
 * 304 is answered from the cache as a 200. Non-GET requests, requests that
 * already carry If-None-Match, and responses without an ETag pass through
 * untouched. Each wrapper owns its own cache, so a new client starts empty.
 */
export function createEtagFetch(baseFetch: Fetch = globalThis.fetch, limits: EtagCacheLimits = defaultLimits): Fetch {
  const cache = new Map<string, CachedEntry>()
  let totalBytes = 0

  function removeEntry(key: string): void {
    const entry = cache.get(key)
    if (!entry) return
    totalBytes -= entry.body.byteLength
    cache.delete(key)
  }

  function storeEntry(key: string, entry: CachedEntry): void {
    removeEntry(key)
    if (entry.body.byteLength > limits.maxEntryBytes) return
    cache.set(key, entry)
    totalBytes += entry.body.byteLength
    for (const oldest of cache.keys()) {
      if (totalBytes <= limits.maxTotalBytes) break
      removeEntry(oldest)
    }
  }

  // Move an entry to the most-recently-used end without touching byte totals.
  // Only if it is still the entry we read: a concurrent 200 may have replaced it.
  function touchEntry(key: string, entry: CachedEntry): void {
    if (cache.get(key) !== entry) return
    cache.delete(key)
    cache.set(key, entry)
  }

  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
    const headers = buildRequestHeaders(input, init)
    if (method !== "GET" || headers.has("if-none-match")) return baseFetch(input, init)

    const key = `${headers.get("accept") ?? ""} ${getRequestUrl(input)}`
    const cached = cache.get(key)
    if (cached) headers.set("if-none-match", cached.etag)

    const response = await baseFetch(input, { ...init, headers })

    if (response.status === 304 && cached) {
      touchEntry(key, cached)
      return new Response(cached.body.slice(0), {
        status: 200,
        headers: buildReplayHeaders(cached.headers, response.headers),
      })
    }

    if (goneStatuses.has(response.status)) {
      removeEntry(key)
      return response
    }
    if (response.status !== 200) return response

    const etag = response.headers.get("etag")
    if (!etag || exceedsLimit(response, limits.maxEntryBytes)) {
      removeEntry(key)
      return response
    }
    const body = await response.clone().arrayBuffer()
    storeEntry(key, { etag, body, headers: response.headers })
    return response
  }
}
