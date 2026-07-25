import { describe, it, expect } from "vitest"
import { registerTunnel, unregisterTunnel, getTunnel, listServerIds } from "./registry.js"
import type { Tunnel } from "./tunnel.js"

// The registry is the per-user gate: a client can only reach a server that was
// registered under the client's own email. These are the security-critical
// invariants, tested without real sockets.
function fakeTunnel(serverId = "s", name = "srv", version?: string): Tunnel {
  return { close() {}, serverId, name, version } as unknown as Tunnel
}

describe("registry per-user namespacing", () => {
  it("returns a server only to its owning email", () => {
    const t = fakeTunnel()
    registerTunnel("alice@minut.com", "laptop", t)
    expect(getTunnel("alice@minut.com", "laptop")).toBe(t)
    // Same serverId, different user → not visible (no cross-user access).
    expect(getTunnel("bob@minut.com", "laptop")).toBeUndefined()
    unregisterTunnel("alice@minut.com", "laptop", t)
    expect(getTunnel("alice@minut.com", "laptop")).toBeUndefined()
  })

  it("lets two users share a serverId without colliding", () => {
    const a = fakeTunnel()
    const b = fakeTunnel()
    registerTunnel("alice@minut.com", "dev", a)
    registerTunnel("bob@minut.com", "dev", b)
    expect(getTunnel("alice@minut.com", "dev")).toBe(a)
    expect(getTunnel("bob@minut.com", "dev")).toBe(b)
  })

  it("lists only the caller's own servers, with names", () => {
    registerTunnel("dana@minut.com", "alpha", fakeTunnel("alpha", "Laptop", "1.2.3"))
    registerTunnel("dana@minut.com", "beta", fakeTunnel("beta", "Desktop"))
    registerTunnel("erin@minut.com", "alpha", fakeTunnel("alpha", "Other"))

    const dana = listServerIds("dana@minut.com").sort((a, b) => a.serverId.localeCompare(b.serverId))
    expect(dana).toEqual([
      { serverId: "alpha", name: "Laptop", version: "1.2.3" },
      { serverId: "beta", name: "Desktop", version: undefined },
    ])
    expect(listServerIds("nobody@minut.com")).toEqual([])
  })

  it("ignores a stale unregister from a replaced tunnel", () => {
    const first = fakeTunnel()
    const second = fakeTunnel()
    registerTunnel("carol@minut.com", "box", first)
    registerTunnel("carol@minut.com", "box", second) // replaces first
    unregisterTunnel("carol@minut.com", "box", first) // stale — must not evict second
    expect(getTunnel("carol@minut.com", "box")).toBe(second)
  })
})
