import { describe, it, expect, vi, afterEach } from "vitest"
import { mapUsageResponse, fetchClaudeUsage, _resetUsageCache } from "./claude-usage.service.js"

describe("mapUsageResponse", () => {
  it("maps the five_hour and seven_day windows to session and weekly", () => {
    const usage = mapUsageResponse({
      five_hour: {
        utilization: 45,
        resets_at: "2026-06-25T17:29:59.319123+00:00",
      },
      seven_day: {
        utilization: 55,
        resets_at: "2026-06-26T23:59:59.319143+00:00",
      },
    })

    expect(usage).toEqual({
      connected: true,
      session: { utilization: 45, resetsAt: "2026-06-25T17:29:59.319123+00:00" },
      weekly: { utilization: 55, resetsAt: "2026-06-26T23:59:59.319143+00:00" },
      error: null,
    })
  })

  it("yields a null window when one is omitted", () => {
    const usage = mapUsageResponse({
      five_hour: { utilization: 10, resets_at: "2026-06-25T17:29:59Z" },
    })

    expect(usage.session).toEqual({ utilization: 10, resetsAt: "2026-06-25T17:29:59Z" })
    expect(usage.weekly).toBeNull()
    expect(usage.connected).toBe(true)
  })

  it("yields a null window when a field is the wrong type or missing", () => {
    const usage = mapUsageResponse({
      five_hour: { utilization: null, resets_at: "2026-06-25T17:29:59Z" },
      seven_day: { utilization: 55, resets_at: null },
    })

    expect(usage.session).toBeNull()
    expect(usage.weekly).toBeNull()
  })
})

describe("fetchClaudeUsage stale cache", () => {
  const goodPayload = {
    five_hour: { utilization: 30, resets_at: "2026-06-25T17:29:59Z" },
    seven_day: { utilization: 40, resets_at: "2026-06-26T23:59:59Z" },
  }

  const originalPlatform = process.platform

  afterEach(() => {
    _resetUsageCache()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    Object.defineProperty(process, "platform", { value: originalPlatform })
  })

  it("serves the last good reading when a poll fails while a token is present", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    const first = await fetchClaudeUsage()
    expect(first.connected).toBe(true)
    expect(first.session).toEqual({ utilization: 30, resetsAt: "2026-06-25T17:29:59Z" })

    // Next poll throws: we should keep serving the cached reading, not collapse.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    const second = await fetchClaudeUsage()
    expect(second).toEqual(first)
  })

  it("serves the last good reading on a non-2xx response", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    await fetchClaudeUsage()

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const result = await fetchClaudeUsage()
    expect(result.connected).toBe(true)
    expect(result.weekly).toEqual({ utilization: 40, resetsAt: "2026-06-26T23:59:59Z" })
  })

  it("drops the cached reading and disconnects on a 401 auth failure", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    await fetchClaudeUsage()

    // 401 means the token is bad, not a transient blip — don't serve stale.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const result = await fetchClaudeUsage()
    expect(result.connected).toBe(false)

    // The cache must be gone: a later transient failure can't resurrect it.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    const after = await fetchClaudeUsage()
    expect(after.connected).toBe(false)
  })

  it("reports disconnected on failure when there is no cached reading", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    const result = await fetchClaudeUsage()
    expect(result.connected).toBe(false)
    expect(result.error).toBe("network down")
  })

  it("drops the cached reading once the token is gone", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    await fetchClaudeUsage()

    // Token cleared: even though a stale reading exists, sign-out must win.
    // Force the non-darwin path so the lookup can't fall through to a real
    // keychain entry on the machine running the test.
    Object.defineProperty(process, "platform", { value: "linux" })
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "")
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/huxflux-nonexistent-config-dir")
    const result = await fetchClaudeUsage()
    expect(result.connected).toBe(false)
  })
})
