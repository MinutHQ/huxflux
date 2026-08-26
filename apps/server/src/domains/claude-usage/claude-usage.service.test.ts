import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createTestDb, type TestDb } from "../../../test/harness.js"
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
      spend: null,
      error: null,
    })
  })

  it("maps the spend total, leaving deltas for the caller to fill in", () => {
    const usage = mapUsageResponse({
      spend: {
        used: { amount_minor: 34654, currency: "EUR", exponent: 2 },
      },
    })

    expect(usage.spend).toEqual({
      amountMinor: 34654,
      currency: "EUR",
      exponent: 2,
      deltas: { hour: null, day: null, week: null },
    })
  })

  it("yields a null spend when the total is absent or malformed", () => {
    expect(mapUsageResponse({}).spend).toBeNull()
    expect(mapUsageResponse({ spend: null }).spend).toBeNull()
    expect(mapUsageResponse({ spend: { used: null } }).spend).toBeNull()
    expect(
      mapUsageResponse({ spend: { used: { amount_minor: 100, currency: null, exponent: 2 } } }).spend,
    ).toBeNull()
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

  // Fixed clock. The cache serves a reading without refetching for FRESH_MS, so
  // cases that need a real upstream call pass a `now` past that window.
  const T0 = 1_800_000_000_000
  const LATER = T0 + 61_000

  const originalPlatform = process.platform
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
    _resetUsageCache()
  })

  afterEach(() => {
    _resetUsageCache()
    testDb.close()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    Object.defineProperty(process, "platform", { value: originalPlatform })
  })

  it("serves a fresh reading without going upstream again", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")
    const upstream = vi.fn().mockResolvedValue({ ok: true, json: async () => goodPayload })
    vi.stubGlobal("fetch", upstream)

    const first = await fetchClaudeUsage(T0)
    const second = await fetchClaudeUsage(T0 + 30_000)

    expect(second).toEqual(first)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it("goes upstream again once the reading is stale", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")
    const upstream = vi.fn().mockResolvedValue({ ok: true, json: async () => goodPayload })
    vi.stubGlobal("fetch", upstream)

    await fetchClaudeUsage(T0)
    await fetchClaudeUsage(LATER)

    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it("recovers the last good reading from the database after a restart", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => goodPayload }))
    const first = await fetchClaudeUsage(T0)

    // Simulate a process restart: the in-memory copy is gone, the row is not.
    _resetUsageCache()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    const afterRestart = await fetchClaudeUsage(LATER)
    expect(afterRestart).toEqual(first)
    expect(afterRestart.connected).toBe(true)
  })

  it("serves the last good reading when a poll fails while a token is present", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    const first = await fetchClaudeUsage(T0)
    expect(first.connected).toBe(true)
    expect(first.session).toEqual({ utilization: 30, resetsAt: "2026-06-25T17:29:59Z" })

    // Next poll throws: we should keep serving the cached reading, not collapse.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    const second = await fetchClaudeUsage(LATER)
    expect(second).toEqual(first)
  })

  it("serves the last good reading on a non-2xx response", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    await fetchClaudeUsage(T0)

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const result = await fetchClaudeUsage(LATER)
    expect(result.connected).toBe(true)
    expect(result.weekly).toEqual({ utilization: 40, resetsAt: "2026-06-26T23:59:59Z" })
  })

  it("drops the cached reading and disconnects on a 401 auth failure", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    await fetchClaudeUsage(T0)

    // 401 means the token is bad, not a transient blip — don't serve stale.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const result = await fetchClaudeUsage(LATER)
    expect(result.connected).toBe(false)

    // The cache must be gone: a later transient failure can't resurrect it,
    // and neither can a restart, because the row was deleted too.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    _resetUsageCache()
    const after = await fetchClaudeUsage(LATER + 61_000)
    expect(after.connected).toBe(false)
  })

  it("reports disconnected on failure when there is no cached reading", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    const result = await fetchClaudeUsage(T0)
    expect(result.connected).toBe(false)
    expect(result.error).toBe("network down")
  })

  it("drops the cached reading once the token is gone", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "tok")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => goodPayload,
    }))
    await fetchClaudeUsage(T0)

    // Token cleared: even though a stale reading exists, sign-out must win.
    // Force the non-darwin path so the lookup can't fall through to a real
    // keychain entry on the machine running the test.
    Object.defineProperty(process, "platform", { value: "linux" })
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "")
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/huxflux-nonexistent-config-dir")
    const result = await fetchClaudeUsage(LATER)
    expect(result.connected).toBe(false)
  })
})
