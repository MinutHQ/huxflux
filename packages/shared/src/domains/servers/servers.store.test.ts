import { describe, it, expect, beforeEach } from "vitest"
import {
  parseConnectionString, serverAuthHeaders, serverWsUrl, serverAuthedUrl, isProxiedServer, normalizeServerUrl,
  addServer, removeServer, updateServer, setActiveServerId, getActiveServer, getServers,
  subscribeServers, getServersSnapshot, parseServersSnapshot, notifyServersChanged,
} from "./servers.store.js"
import { configureStorage } from "../../storage.js"
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

describe("serverAuthedUrl", () => {
  it("carries proxy_token over http for proxied servers", () => {
    expect(serverAuthedUrl(proxied, "/api/x")).toBe("https://proxy.example.com/s/laptop/api/x?proxy_token=jwt.abc")
  })

  it("carries token for direct servers and appends with & after a query", () => {
    expect(serverAuthedUrl(direct, "/api/x?a=1")).toBe("http://192.168.1.5:4321/api/x?a=1&token=tok123")
  })

  it("returns the bare URL when there is no credential", () => {
    expect(serverAuthedUrl({ url: "http://192.168.1.5:4321" }, "/api/x")).toBe("http://192.168.1.5:4321/api/x")
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

describe("normalizeServerUrl", () => {
  it("prepends http:// when no scheme is given", () => {
    expect(normalizeServerUrl("localhost:4399")).toBe("http://localhost:4399")
    expect(normalizeServerUrl("192.168.1.5:4321")).toBe("http://192.168.1.5:4321")
  })

  it("keeps existing schemes untouched", () => {
    expect(normalizeServerUrl("http://localhost:4399")).toBe("http://localhost:4399")
    expect(normalizeServerUrl("https://proxy.example.com/s/laptop")).toBe("https://proxy.example.com/s/laptop")
    expect(normalizeServerUrl("huxflux://100.64.0.5:4321")).toBe("huxflux://100.64.0.5:4321")
  })

  it("trims whitespace and trailing slashes", () => {
    expect(normalizeServerUrl(" http://localhost:4399/ ")).toBe("http://localhost:4399")
    expect(normalizeServerUrl("localhost:4399//")).toBe("http://localhost:4399")
  })

  it("returns empty string unchanged", () => {
    expect(normalizeServerUrl("")).toBe("")
    expect(normalizeServerUrl("  ")).toBe("")
  })
})

describe("change subscription", () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = new Map()
    configureStorage({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, v) },
      removeItem: (k) => { store.delete(k) },
    })
  })

  it("does not touch window / DOM events when mutating", () => {
    // React Native defines `window` as the global object but has no `Event`
    // constructor or `dispatchEvent`; the store must never rely on either.
    const g = globalThis as Record<string, unknown>
    const savedEvent = g.Event
    const savedDispatch = g.dispatchEvent
    g.Event = undefined
    g.dispatchEvent = undefined
    try {
      const s = addServer({ name: "a", url: "http://a:1", token: "t" })
      expect(() => setActiveServerId(s.id)).not.toThrow()
      expect(getActiveServer()?.id).toBe(s.id)
    } finally {
      g.Event = savedEvent
      g.dispatchEvent = savedDispatch
    }
  })

  it("notifies listeners on add, set-active, update and remove, and stops after unsubscribe", () => {
    let calls = 0
    const unsubscribe = subscribeServers(() => { calls++ })
    const a = addServer({ name: "a", url: "http://a:1", token: "t" })
    const b = addServer({ name: "b", url: "http://b:1", token: "t" })
    expect(calls).toBe(2)
    setActiveServerId(b.id)
    expect(calls).toBe(3)
    updateServer(a.id, { name: "renamed" })
    expect(calls).toBe(4)
    // Removing the active server also promotes the next one: two notifications.
    removeServer(b.id)
    expect(calls).toBe(6)
    expect(getActiveServer()?.id).toBe(a.id)
    unsubscribe()
    removeServer(a.id)
    expect(calls).toBe(6)
    expect(getServers()).toEqual([])
  })

  it("changes the snapshot when the list or the active id changes, and stays equal otherwise", () => {
    const empty = getServersSnapshot()
    const a = addServer({ name: "a", url: "http://a:1", token: "t" })
    const afterAdd = getServersSnapshot()
    expect(afterAdd).not.toBe(empty)
    expect(getServersSnapshot()).toBe(afterAdd)
    setActiveServerId(a.id)
    expect(getServersSnapshot()).not.toBe(afterAdd)
  })

  it("round-trips the list and active id through the snapshot", () => {
    expect(parseServersSnapshot(getServersSnapshot())).toEqual({ servers: [], activeId: null })
    const a = addServer({ name: "a", url: "http://a:1", token: "t" })
    setActiveServerId(a.id)
    const parsed = parseServersSnapshot(getServersSnapshot())
    expect(parsed.activeId).toBe(a.id)
    expect(parsed.servers.map((s) => s.id)).toEqual([a.id])
    expect(parseServersSnapshot("not json\u0000x")).toEqual({ servers: [], activeId: "x" })
  })

  it("lets a host wake subscribers after writing storage directly (async hydration)", () => {
    let calls = 0
    const unsubscribe = subscribeServers(() => { calls++ })
    store.set("huxflux:servers", JSON.stringify([{ id: "x", name: "x", url: "http://x:1", addedAt: "" }]))
    expect(calls).toBe(0)
    notifyServersChanged()
    expect(calls).toBe(1)
    expect(getServers().map((s) => s.id)).toEqual(["x"])
    unsubscribe()
  })
})
