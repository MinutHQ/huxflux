import { describe, it, expect } from "vitest"
import { deriveServerId } from "./serverId.js"

describe("deriveServerId", () => {
  it("is deterministic for the same key", () => {
    expect(deriveServerId("key-abc")).toBe(deriveServerId("key-abc"))
  })

  it("differs for different keys", () => {
    expect(deriveServerId("key-abc")).not.toBe(deriveServerId("key-xyz"))
  })

  it("does not echo the key (server can't choose its URL)", () => {
    const id = deriveServerId("my-chosen-id")
    expect(id).not.toBe("my-chosen-id")
    expect(id).not.toContain("my-chosen-id")
  })

  it("produces a 128-bit hex id", () => {
    expect(deriveServerId("anything")).toMatch(/^[0-9a-f]{32}$/)
  })
})
