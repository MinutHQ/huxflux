import { describe, expect, it } from "vitest"
import { settingsDefaults, settingsSchema, type HuxfluxSettings } from "./settings.schema.js"

describe("settingsDefaults", () => {
  it("matches the HuxfluxSettings shape (compile-time check)", () => {
    // `satisfies` lets TS verify defaults conform to HuxfluxSettings without
    // widening the literal types. If a default's type ever diverges from
    // `HuxfluxSettings[K]`, this file fails to compile and the test bombs.
    const probe = settingsDefaults satisfies HuxfluxSettings
    expect(probe).toBe(settingsDefaults)
  })

  it("exposes a default value for every key declared in settingsSchema", () => {
    for (const key of Object.keys(settingsSchema)) {
      expect(settingsDefaults).toHaveProperty(key)
    }
  })

  it("has the expected default for defaultModel (Opus 4.8)", () => {
    expect(settingsDefaults.defaultModel).toBe("Opus 4.8")
  })

  it("has the expected default for defaultProvider (claude)", () => {
    expect(settingsDefaults.defaultProvider).toBe("claude")
  })

  it("ships threadsEnabled as a boolean false by default", () => {
    expect(typeof settingsDefaults.threadsEnabled).toBe("boolean")
    expect(settingsDefaults.threadsEnabled).toBe(false)
  })

  it("ships pollingIntervalMs as a number within the documented range", () => {
    expect(typeof settingsDefaults.pollingIntervalMs).toBe("number")
    expect(settingsDefaults.pollingIntervalMs).toBeGreaterThanOrEqual(5_000)
    expect(settingsDefaults.pollingIntervalMs).toBeLessThanOrEqual(600_000)
  })
})
