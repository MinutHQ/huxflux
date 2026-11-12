import { describe, expect, it } from "vitest"
import { Octokit } from "@octokit/rest"
import { throttling } from "@octokit/plugin-throttling"
import { retry } from "@octokit/plugin-retry"
import { createEtagFetch, type EtagCacheLimits } from "./etagCache.js"

interface SeenRequest {
  method: string
  url: string
  ifNoneMatch: string | null
}

// A stand-in for GitHub at the network boundary: serves a fixed body per path
// with an ETag derived from that body (and the Accept header), honours
// If-None-Match with a 304, and stamps every reply with a rate-limit counter
// so tests can tell live headers from cached ones. Bodies can be swapped
// mid-test to simulate the resource changing.
interface FakeOptions {
  etags?: boolean
  /** Status to answer with per path, in place of the normal 200/304. */
  statuses?: Record<string, number>
  /** Extra headers sent on a 200 for a path (never on its 304). */
  extraHeaders?: Record<string, Record<string, string>>
}

function createFakeGitHub(bodies: Record<string, unknown> = {}, options: FakeOptions = {}) {
  const seen: SeenRequest[] = []
  const statuses = options.statuses ?? {}
  let remaining = 5000
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init?.headers)
    const method = init?.method ?? "GET"
    seen.push({ method, url: url.pathname + url.search, ifNoneMatch: headers.get("if-none-match") })

    const body = JSON.stringify(bodies[url.pathname] ?? { path: url.pathname, query: url.search })
    const etag = `"${Buffer.from(`${headers.get("accept")}${body}`).toString("base64")}"`
    const live = { "x-ratelimit-remaining": String(--remaining) }
    const status = statuses[url.pathname]
    if (status) return new Response(JSON.stringify({ message: "nope" }), { status, headers: live })
    if (method === "GET" && headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ...live, etag } })
    }
    return new Response(body, {
      status: 200,
      headers: {
        ...live,
        ...(options.etags === false ? {} : { etag }),
        ...options.extraHeaders?.[url.pathname],
        "content-type": "application/json",
      },
    })
  }
  return { fetch, seen, bodies, statuses }
}

function createClient(fake: ReturnType<typeof createFakeGitHub>, limits?: EtagCacheLimits) {
  const logged: string[] = []
  const log = {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => { logged.push(msg) },
    error: (msg: string) => { logged.push(msg) },
  }
  const octokit = new Octokit({ log, request: { fetch: createEtagFetch(fake.fetch, limits) } })
  return { octokit, logged }
}

describe("createEtagFetch", () => {
  it("sends no If-None-Match on the first GET", async () => {
    const fake = createFakeGitHub()
    const { octokit } = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen).toHaveLength(1)
    expect(fake.seen[0]?.ifNoneMatch).toBeNull()
  })

  it("replays the ETag and serves the cached body as a 200 on 304", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const { octokit, logged } = createClient(fake)

    const first = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    const second = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen[1]?.ifNoneMatch).not.toBeNull()
    expect(second.status).toBe(200)
    expect(second.data).toEqual(first.data)
    expect(logged).toEqual([])
  })

  it("takes rate-limit headers from the live 304, not the cached 200", async () => {
    const fake = createFakeGitHub()
    const { octokit } = createClient(fake)

    const first = await octokit.users.getAuthenticated()
    const second = await octokit.users.getAuthenticated()

    expect(first.headers["x-ratelimit-remaining"]).toBe("4999")
    expect(second.headers["x-ratelimit-remaining"]).toBe("4998")
    expect(second.headers["content-type"]).toBe("application/json")
  })

  it("hands each caller its own copy of the body", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const { octokit } = createClient(fake)

    const first = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    first.data.title = "mutated by caller"
    const second = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(second.data.title).toBe("first")
  })

  it("returns the fresh body when the resource changed", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const { octokit } = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    fake.bodies["/repos/o/r/pulls/1"] = { number: 1, title: "second" }
    const changed = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    const again = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(changed.data.title).toBe("second")
    expect(again.data.title).toBe("second")
    expect(fake.seen[2]?.ifNoneMatch).not.toBeNull()
  })

  it("keys the cache by full URL including query params", async () => {
    const fake = createFakeGitHub()
    const { octokit } = createClient(fake)

    const open = await octokit.pulls.list({ owner: "o", repo: "r", state: "open" })
    const closed = await octokit.pulls.list({ owner: "o", repo: "r", state: "closed" })
    const openAgain = await octokit.pulls.list({ owner: "o", repo: "r", state: "open" })
    const closedAgain = await octokit.pulls.list({ owner: "o", repo: "r", state: "closed" })

    expect(fake.seen.map((r) => r.ifNoneMatch !== null)).toEqual([false, false, true, true])
    expect(openAgain.data).toEqual(open.data)
    expect(closedAgain.data).toEqual(closed.data)
    expect(openAgain.data).not.toEqual(closedAgain.data)
  })

  it("keys the cache by Accept header so media types do not collide", async () => {
    const fake = createFakeGitHub()
    const { octokit } = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1, mediaType: { format: "diff" } })

    expect(fake.seen[1]?.ifNoneMatch).toBeNull()
  })

  it("never adds If-None-Match to non-GET requests", async () => {
    const fake = createFakeGitHub()
    const { octokit } = createClient(fake)

    await octokit.issues.createComment({ owner: "o", repo: "r", issue_number: 1, body: "a" })
    await octokit.issues.createComment({ owner: "o", repo: "r", issue_number: 1, body: "a" })

    expect(fake.seen.map((r) => r.ifNoneMatch)).toEqual([null, null])
  })

  it("leaves a caller-supplied If-None-Match alone", async () => {
    const fake = createFakeGitHub()
    const { octokit } = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1, headers: { "if-none-match": "\"mine\"" } })

    expect(fake.seen[1]?.ifNoneMatch).toBe("\"mine\"")
  })

  it("does not cache responses without an ETag", async () => {
    const fake = createFakeGitHub({}, { etags: false })
    const { octokit } = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen.map((r) => r.ifNoneMatch)).toEqual([null, null])
  })

  it("does not cache responses larger than the per-entry limit", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { blob: "x".repeat(200) } })
    const { octokit } = createClient(fake, { maxEntryBytes: 100, maxTotalBytes: 10_000 })

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen[1]?.ifNoneMatch).toBeNull()
  })

  it("evicts the least recently used entry once total bytes exceed the limit", async () => {
    const body = (n: number) => ({ n, pad: "x".repeat(100) })
    const fake = createFakeGitHub({
      "/repos/o/r/pulls/1": body(1),
      "/repos/o/r/pulls/2": body(2),
      "/repos/o/r/pulls/3": body(3),
    })
    const entryBytes = JSON.stringify(body(1)).length
    // Room for exactly two entries.
    const { octokit } = createClient(fake, { maxEntryBytes: 1_000, maxTotalBytes: entryBytes * 2 })

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 2 })
    // Touch #1 so #2 becomes the oldest, then push #3 in to evict #2.
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 3 })
    fake.seen.length = 0

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 2 })

    expect(fake.seen[0]?.ifNoneMatch).not.toBeNull()
    expect(fake.seen[1]?.ifNoneMatch).toBeNull()
  })

  it("keeps caches separate per wrapper", async () => {
    const fake = createFakeGitHub()
    const a = createClient(fake)
    const b = createClient(fake)

    await a.octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await b.octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen[1]?.ifNoneMatch).toBeNull()
  })

  it("works behind the throttling and retry plugins used in production", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const octokit = new (Octokit.plugin(throttling, retry))({
      request: { fetch: createEtagFetch(fake.fetch) },
      throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false },
    })

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    const second = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen).toHaveLength(2)
    expect(fake.seen[1]?.ifNoneMatch).not.toBeNull()
    expect(second.data.title).toBe("first")
  })

  it("keeps the cached Link header so pagination still follows next pages", async () => {
    const next = "<https://api.github.com/repositories/1/branches?per_page=1&page=2>; rel=\"next\""
    const fake = createFakeGitHub(
      { "/repos/o/r/branches": [{ name: "a" }], "/repositories/1/branches": [{ name: "b" }] },
      { extraHeaders: { "/repos/o/r/branches": { link: next } } },
    )
    const { octokit } = createClient(fake)

    const first = await octokit.paginate(octokit.repos.listBranches, { owner: "o", repo: "r", per_page: 1 })
    const second = await octokit.paginate(octokit.repos.listBranches, { owner: "o", repo: "r", per_page: 1 })

    expect(first.map((b) => b.name)).toEqual(["a", "b"])
    expect(second.map((b) => b.name)).toEqual(["a", "b"])
    expect(fake.seen[2]?.ifNoneMatch).not.toBeNull()
  })

  it("keeps the cached entry through a transient error", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const { octokit } = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    fake.statuses["/repos/o/r/pulls/1"] = 502
    await expect(octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })).rejects.toMatchObject({ status: 502 })
    delete fake.statuses["/repos/o/r/pulls/1"]
    const recovered = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen[2]?.ifNoneMatch).not.toBeNull()
    expect(recovered.data.title).toBe("first")
  })

  it("drops the cached entry once the resource is gone", async () => {
    const fake = createFakeGitHub()
    const { octokit } = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    fake.statuses["/repos/o/r/pulls/1"] = 404
    await expect(octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })).rejects.toMatchObject({ status: 404 })
    delete fake.statuses["/repos/o/r/pulls/1"]
    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen[2]?.ifNoneMatch).toBeNull()
  })

  it("skips caching when content-length already exceeds the per-entry limit", async () => {
    let cloned = false
    const big = async (): Promise<Response> => {
      const response = new Response("{}", {
        status: 200,
        headers: { etag: "\"e\"", "content-length": "999999", "content-type": "application/json" },
      })
      const clone = response.clone.bind(response)
      response.clone = () => { cloned = true; return clone() }
      return response
    }
    const fetch = createEtagFetch(big, { maxEntryBytes: 100, maxTotalBytes: 1_000 })

    await fetch("https://api.github.com/x")

    expect(cloned).toBe(false)
  })

  it("keeps headers from a Request input", async () => {
    const fake = createFakeGitHub()
    let authorization: string | null = null
    const recording = createEtagFetch(async (input, init) => {
      authorization = new Headers(init?.headers).get("authorization")
      return fake.fetch(input, init)
    })

    await recording(new Request("https://api.github.com/x", { headers: { authorization: "token t" } }))

    expect(authorization).toBe("token t")
  })
})
