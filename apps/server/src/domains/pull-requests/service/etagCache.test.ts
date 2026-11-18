import { describe, expect, it } from "vitest"
import { Octokit } from "@octokit/rest"
import { throttling } from "@octokit/plugin-throttling"
import { retry } from "@octokit/plugin-retry"
import { installEtagCache } from "./etagCache.js"

interface SeenRequest {
  method: string
  url: string
  ifNoneMatch: string | null
}

// A stand-in for GitHub at the network boundary: serves a fixed body per path
// with an ETag derived from that body, and honours If-None-Match with a 304.
// Bodies can be swapped mid-test to simulate the resource changing.
function createFakeGitHub(bodies: Record<string, unknown>) {
  const seen: SeenRequest[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init?.headers)
    const method = init?.method ?? "GET"
    seen.push({ method, url: url.pathname + url.search, ifNoneMatch: headers.get("if-none-match") })

    const body = JSON.stringify(bodies[url.pathname] ?? { ok: true })
    const etag = `"${Buffer.from(body).toString("base64")}"`
    if (method === "GET" && headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { etag } })
    }
    return new Response(body, { status: 200, headers: { etag, "content-type": "application/json" } })
  }
  return { fetch, seen, bodies }
}

function createClient(fake: ReturnType<typeof createFakeGitHub>, maxEntries?: number): Octokit {
  const octokit = new Octokit({ request: { fetch: fake.fetch } })
  installEtagCache(octokit, maxEntries)
  return octokit
}

describe("installEtagCache", () => {
  it("sends no If-None-Match on the first GET", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1 } })
    const octokit = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen).toHaveLength(1)
    expect(fake.seen[0]?.ifNoneMatch).toBeNull()
  })

  it("replays the ETag and returns the cached body on 304", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const octokit = createClient(fake)

    const first = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    const second = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen[1]?.ifNoneMatch).not.toBeNull()
    expect(second.status).toBe(200)
    expect(second.data).toEqual(first.data)
    expect(second.data.title).toBe("first")
  })

  it("returns the fresh body when the resource changed", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const octokit = createClient(fake)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    fake.bodies["/repos/o/r/pulls/1"] = { number: 1, title: "second" }
    const changed = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    const again = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(changed.data.title).toBe("second")
    expect(again.data.title).toBe("second")
  })

  it("keys the cache by full URL including query params", async () => {
    const fake = createFakeGitHub({})
    const octokit = createClient(fake)

    await octokit.pulls.list({ owner: "o", repo: "r", state: "open" })
    await octokit.pulls.list({ owner: "o", repo: "r", state: "closed" })

    expect(fake.seen[0]?.ifNoneMatch).toBeNull()
    expect(fake.seen[1]?.ifNoneMatch).toBeNull()
  })

  it("never adds If-None-Match to non-GET requests", async () => {
    const fake = createFakeGitHub({})
    const octokit = createClient(fake)

    await octokit.issues.createComment({ owner: "o", repo: "r", issue_number: 1, body: "a" })
    await octokit.issues.createComment({ owner: "o", repo: "r", issue_number: 1, body: "a" })

    expect(fake.seen.map((r) => r.ifNoneMatch)).toEqual([null, null])
  })

  it("evicts the least recently used entry past the cap", async () => {
    const fake = createFakeGitHub({})
    const octokit = createClient(fake, 2)

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

  it("keeps caches separate per client instance", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1 } })
    const a = createClient(fake)
    const b = createClient(fake)

    await a.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    await b.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen[1]?.ifNoneMatch).toBeNull()
  })

  it("works behind the throttling and retry plugins used in production", async () => {
    const fake = createFakeGitHub({ "/repos/o/r/pulls/1": { number: 1, title: "first" } })
    const octokit = new (Octokit.plugin(throttling, retry))({
      request: { fetch: fake.fetch },
      throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false },
    })
    installEtagCache(octokit)

    await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })
    const second = await octokit.pulls.get({ owner: "o", repo: "r", pull_number: 1 })

    expect(fake.seen).toHaveLength(2)
    expect(fake.seen[1]?.ifNoneMatch).not.toBeNull()
    expect(second.data.title).toBe("first")
  })
})
