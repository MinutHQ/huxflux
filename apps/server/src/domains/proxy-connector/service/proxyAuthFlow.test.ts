import { describe, it, expect } from "vitest"
import { toProxyHttpBase } from "./proxyAuthFlow.js"

describe("toProxyHttpBase", () => {
  it("maps wss:// to https://", () => {
    expect(toProxyHttpBase("wss://proxy.example.com")).toBe("https://proxy.example.com")
  })

  it("maps ws:// to http://", () => {
    expect(toProxyHttpBase("ws://localhost:8080")).toBe("http://localhost:8080")
  })

  it("strips trailing slashes", () => {
    expect(toProxyHttpBase("wss://proxy.example.com/")).toBe("https://proxy.example.com")
    expect(toProxyHttpBase("wss://proxy.example.com///")).toBe("https://proxy.example.com")
  })

  it("preserves a path segment", () => {
    expect(toProxyHttpBase("wss://proxy.example.com/tunnel")).toBe("https://proxy.example.com/tunnel")
  })

  it("only rewrites the leading scheme, not later occurrences", () => {
    expect(toProxyHttpBase("wss://ws.example.com")).toBe("https://ws.example.com")
  })
})
