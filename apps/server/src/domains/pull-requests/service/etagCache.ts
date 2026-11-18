import type { Octokit } from "@octokit/rest"

// Conditional-request cache for the shared Octokit client. GitHub does not
// count a `304 Not Modified` against the primary rate limit, so replaying the
// last ETag on every GET makes unchanged resources free to re-check. The poller
// hits the same handful of endpoints per agent every cycle, which is exactly
// the shape this pays off for. Responses are validated server-side on every
// call, so a cached body is never served stale: GitHub only answers 304 when
// the resource is byte-identical to what we hold.

const DEFAULT_MAX_ENTRIES = 2_000

interface CachedResponse {
  etag: string
  response: Awaited<ReturnType<Octokit["request"]>>
}

function isNotModified(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && err.status === 304
}

/**
 * Wrap every GET on `octokit` with If-None-Match. On 304 the previously cached
 * response is returned in place of the error, so callers never see the
 * difference. The cache is an LRU capped at `maxEntries`; it lives on the
 * instance, so rebuilding the client (token change) starts it empty.
 */
export function installEtagCache(octokit: Octokit, maxEntries = DEFAULT_MAX_ENTRIES): void {
  const cache = new Map<string, CachedResponse>()

  octokit.hook.wrap("request", async (request, options) => {
    const parsed = octokit.request.endpoint.parse(options)
    if (parsed.method !== "GET" || parsed.headers["if-none-match"]) return request(options)

    const key = `${parsed.headers.accept ?? ""} ${parsed.url}`
    const cached = cache.get(key)
    // Mutate rather than pass a copy: before-after-hook binds the original
    // options object to every inner hook (throttling, retry), so a copy handed
    // to `request` would be dropped before it reached fetch. `options` is a
    // fresh object per call, so mutating it does not leak across requests.
    if (cached) options.headers["if-none-match"] = cached.etag
    try {
      const response = await request(options)
      const etag = response.headers.etag
      cache.delete(key)
      if (etag) {
        cache.set(key, { etag, response })
        evictOldest(cache, maxEntries)
      }
      return response
    } catch (err) {
      if (!cached || !isNotModified(err)) throw err
      // Refresh recency so hot entries survive eviction.
      cache.delete(key)
      cache.set(key, cached)
      return cached.response
    }
  })
}

function evictOldest(cache: Map<string, CachedResponse>, maxEntries: number): void {
  for (const key of cache.keys()) {
    if (cache.size <= maxEntries) return
    cache.delete(key)
  }
}
