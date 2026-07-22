import { describe, it, expect } from "vitest"
import { parseConnectionString } from "./servers.store.js"

describe("parseConnectionString", () => {
  it("parses a bare huxflux:// LAN connection string", () => {
    expect(parseConnectionString("huxflux://100.71.2.3:4321?token=abc")).toEqual({
      url: "http://100.71.2.3:4321",
      token: "abc",
    })
  })

  it("parses an http(s) URL with a token", () => {
    expect(parseConnectionString("https://example.com?token=xyz")).toEqual({
      url: "https://example.com",
      token: "xyz",
    })
  })

  it("preserves a proxy path prefix (the server selector)", () => {
    expect(
      parseConnectionString("https://proxy.example.com/s/server-42?token=secret")
    ).toEqual({
      url: "https://proxy.example.com/s/server-42",
      token: "secret",
    })
  })

  it("preserves a path prefix from a huxflux:// string too", () => {
    expect(parseConnectionString("huxflux://proxy.example.com/s/abc?token=t")).toEqual({
      url: "http://proxy.example.com/s/abc",
      token: "t",
    })
  })

  it("drops a meaningless root path and a trailing slash", () => {
    expect(parseConnectionString("https://example.com/?token=t")).toEqual({
      url: "https://example.com",
      token: "t",
    })
    expect(parseConnectionString("https://proxy.example.com/s/abc/?token=t")).toEqual({
      url: "https://proxy.example.com/s/abc",
      token: "t",
    })
  })

  it("returns a token-less result when none is present", () => {
    expect(parseConnectionString("https://proxy.example.com/s/abc")).toEqual({
      url: "https://proxy.example.com/s/abc",
      token: undefined,
    })
  })

  it("returns null for garbage input", () => {
    expect(parseConnectionString("not a url")).toBeNull()
  })
})
