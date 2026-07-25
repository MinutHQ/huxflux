import { describe, it, expect } from "vitest"
import { parseConnectionString, serverAuthHeaders, serverWsUrl, isProxiedServer } from "./servers.store.js"
import type { HuxfluxServer } from "./servers.types.js"

const direct: HuxfluxServer = { id: "1", name: "lan", url: "http://192.168.1.5:4321", token: "tok123", addedAt: "" }
const proxied: HuxfluxServer = {
  id: "2", name: "proxied", url: "https://proxy.example.com/s/laptop",
  proxyAccessToken: "jwt.abc", proxyRefreshToken: "r", proxyAccountEmail: "a@minut.com", addedAt: "",
}

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

describe("isProxiedServer", () => {
  it("detects a proxied server by token or /s/ path", () => {
    expect(isProxiedServer(proxied)).toBe(true)
    expect(isProxiedServer({ url: "https://proxy.example.com/s/x" })).toBe(true)
    expect(isProxiedServer(direct)).toBe(false)
  })
})

describe("serverAuthHeaders", () => {
  it("uses the proxy header for proxied servers", () => {
    expect(serverAuthHeaders(proxied)).toEqual({ "x-huxflux-proxy-authorization": "Bearer jwt.abc" })
  })

  it("uses a bearer Authorization for direct servers", () => {
    expect(serverAuthHeaders(direct)).toEqual({ Authorization: "Bearer tok123" })
  })

  it("returns no headers when a token is missing or server is null", () => {
    expect(serverAuthHeaders({ url: "https://proxy.example.com/s/x" })).toEqual({})
    expect(serverAuthHeaders({ url: "http://192.168.1.5:4321" })).toEqual({})
    expect(serverAuthHeaders(null)).toEqual({})
  })
})

describe("serverWsUrl", () => {
  it("carries proxy_token for proxied servers and preserves the path prefix", () => {
    expect(serverWsUrl(proxied, "/ws")).toBe("wss://proxy.example.com/s/laptop/ws?proxy_token=jwt.abc")
  })

  it("carries token for direct servers", () => {
    expect(serverWsUrl(direct, "/ws")).toBe("ws://192.168.1.5:4321/ws?token=tok123")
  })

  it("uses & when the path already has a query string", () => {
    expect(serverWsUrl(proxied, "/ws/pty/a?terminalId=t1&fresh=1")).toBe(
      "wss://proxy.example.com/s/laptop/ws/pty/a?terminalId=t1&fresh=1&proxy_token=jwt.abc"
    )
  })
})
