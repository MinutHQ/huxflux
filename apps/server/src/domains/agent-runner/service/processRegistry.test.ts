import { describe, expect, it } from "vitest"
import { resolveModelAlias } from "./processRegistry.js"

describe("resolveModelAlias", () => {
  it("returns the fallback when model is undefined", () => {
    expect(resolveModelAlias(undefined)).toBe("claude-sonnet-4-6")
    expect(resolveModelAlias(undefined, "claude-opus-4-7")).toBe("claude-opus-4-7")
  })

  it("returns an API id unchanged", () => {
    expect(resolveModelAlias("claude-opus-4-6")).toBe("claude-opus-4-6")
    expect(resolveModelAlias("claude-haiku-4-5")).toBe("claude-haiku-4-5")
  })

  it("translates known display names to API ids", () => {
    expect(resolveModelAlias("Sonnet 4.6")).toBe("claude-sonnet-4-6")
    expect(resolveModelAlias("Opus 4.7")).toBe("claude-opus-4-7")
    expect(resolveModelAlias("Opus 4.6")).toBe("claude-opus-4-6")
    expect(resolveModelAlias("Haiku 4.5")).toBe("claude-haiku-4-5")
  })

  it("falls back when the display name is unknown", () => {
    expect(resolveModelAlias("Mystery 9.9")).toBe("claude-sonnet-4-6")
    expect(resolveModelAlias("Mystery 9.9", "claude-opus-4-7")).toBe("claude-opus-4-7")
  })

  it("treats the empty string as missing (returns the fallback)", () => {
    expect(resolveModelAlias("")).toBe("claude-sonnet-4-6")
  })
})
