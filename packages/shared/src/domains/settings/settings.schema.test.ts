import { describe, expect, it } from "vitest"
import { settingsDefaults, settingsSchema, type HuxfluxSettings } from "./settings.schema.js"

import { partialHuxfluxSettingsSchema } from "./settings.types.js"

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

describe("model visibility settings", () => {
  it("keeps all models visible for existing settings", () => {
    expect(settingsDefaults.hiddenModels).toEqual([])
    expect(partialHuxfluxSettingsSchema.parse({})).toEqual({})
  })

  it("preserves provider-qualified IDs and independent default selection", () => {
    const settings = { hiddenModels: ["claude:shared-id", "pi:openai/gpt-5"], defaultProvider: "codex", defaultModel: "GPT-5" }
    expect(partialHuxfluxSettingsSchema.parse(settings)).toEqual(settings)
    expect(partialHuxfluxSettingsSchema.parse({ hiddenModels: [] })).toEqual({ hiddenModels: [] })
  })

  it("rejects malformed visibility lists", () => {
    expect(partialHuxfluxSettingsSchema.safeParse({ hiddenModels: "claude:model" }).success).toBe(false)
    expect(partialHuxfluxSettingsSchema.safeParse({ hiddenModels: [42] }).success).toBe(false)
  })
})
