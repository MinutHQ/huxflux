import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetModelsCatalog, fetchModelsCatalog, getModelsForHarness, isCatalogLoaded } from "./modelsCatalog.js"

const SIX_HOURS = 6 * 60 * 60 * 1000
const FIVE_MINUTES = 5 * 60 * 1000

function catalogWith(modelIds: string[]) {
  const models = Object.fromEntries(modelIds.map((id) => [id, { id, name: id }]))
  return { anthropic: { id: "anthropic", name: "Anthropic", models } }
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function claudeIds(): string[] {
  return (getModelsForHarness("claude") ?? []).map((m) => m.id)
}

describe("fetchModelsCatalog refresh loop", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetModelsCatalog()
  })

  afterEach(() => {
    _resetModelsCatalog()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("refreshes again six hours after a successful fetch", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(okResponse(catalogWith(["claude-fable-5"])))
      .mockResolvedValueOnce(okResponse(catalogWith(["claude-fable-5", "claude-fable-5-2"])))
    vi.stubGlobal("fetch", upstream)

    await fetchModelsCatalog()
    expect(claudeIds()).toEqual(["claude-fable-5"])

    await vi.advanceTimersByTimeAsync(SIX_HOURS)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(claudeIds()).toEqual(["claude-fable-5", "claude-fable-5-2"])
  })

  it("keeps the old catalog and retries after a network error", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(okResponse(catalogWith(["claude-fable-5"])))
      .mockRejectedValueOnce(new TypeError("fetch failed: getaddrinfo ENOTFOUND models.dev"))
      .mockResolvedValueOnce(okResponse(catalogWith(["claude-fable-5-2"])))
    vi.stubGlobal("fetch", upstream)

    await fetchModelsCatalog()
    await vi.advanceTimersByTimeAsync(SIX_HOURS)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(claudeIds()).toEqual(["claude-fable-5"])

    await vi.advanceTimersByTimeAsync(FIVE_MINUTES)
    expect(upstream).toHaveBeenCalledTimes(3)
    expect(claudeIds()).toEqual(["claude-fable-5-2"])
  })

  it("retries after a non-OK response when nothing has loaded yet", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(okResponse(catalogWith(["claude-opus-5-5"])))
    vi.stubGlobal("fetch", upstream)

    await fetchModelsCatalog()
    expect(isCatalogLoaded()).toBe(false)

    await vi.advanceTimersByTimeAsync(FIVE_MINUTES)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(claudeIds()).toEqual(["claude-opus-5-5"])
  })
})
