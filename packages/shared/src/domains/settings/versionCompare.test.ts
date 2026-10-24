import { describe, expect, it } from "vitest"
import { isNewerVersion } from "./versionCompare.js"

describe("isNewerVersion", () => {
  it("compares major, minor and patch numerically", () => {
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true)
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true)
    expect(isNewerVersion("0.3.6", "0.3.10")).toBe(false)
  })

  it("is false for equal versions", () => {
    expect(isNewerVersion("0.3.5", "0.3.5")).toBe(false)
    expect(isNewerVersion("0.3.5-beta.2", "0.3.5-beta.2")).toBe(false)
  })

  it("ranks a release above its prereleases", () => {
    expect(isNewerVersion("0.3.5", "0.3.5-beta.4")).toBe(true)
    expect(isNewerVersion("0.3.5-beta.4", "0.3.5")).toBe(false)
  })

  it("compares numeric prerelease parts numerically", () => {
    expect(isNewerVersion("0.3.5-beta.10", "0.3.5-beta.9")).toBe(true)
    expect(isNewerVersion("0.3.5-beta.9", "0.3.5-beta.10")).toBe(false)
  })

  it("handles prerelease tags other than beta", () => {
    expect(isNewerVersion("0.3.5-rc.1", "0.3.5-beta.3")).toBe(true)
    expect(isNewerVersion("0.3.5-beta.3.1", "0.3.5-beta.3")).toBe(true)
    expect(isNewerVersion("0.3.6-alpha", "0.3.5")).toBe(true)
  })

  it("ignores a leading v and build metadata", () => {
    expect(isNewerVersion("v0.3.6", "0.3.5")).toBe(true)
    expect(isNewerVersion("0.3.5+build.7", "0.3.5")).toBe(false)
  })

  it("never treats unparseable input as newer", () => {
    expect(isNewerVersion("", "0.3.5")).toBe(false)
    expect(isNewerVersion("latest", "0.3.5")).toBe(false)
    expect(isNewerVersion("0.3.6", "garbage")).toBe(false)
  })
})
