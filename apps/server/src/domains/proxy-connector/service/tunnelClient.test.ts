import { describe, it, expect, beforeAll, afterAll } from "vitest"
import * as http from "node:http"
import { AddressInfo } from "node:net"
import { WebSocketServer, WebSocket } from "ws"
import { encodeFrame, decodeFrame, type TunnelFrame, type TunnelFrameHeader } from "@huxflux/shared/proxy"
import { TunnelClient } from "./tunnelClient.js"

// End-to-end test with real sockets: a fake proxy (a `ws` server), a real
// loopback HTTP+WS target, and a real TunnelClient bridging them. No mocks —
// this exercises the whole frame state machine and both loopback paths.

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}
function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

describe("TunnelClient", () => {
  let loopback: http.Server
  let loopbackWss: WebSocketServer
  let proxy: WebSocketServer
  let client: TunnelClient

  // Frames the client sends to the (fake) proxy, plus a waiter.
  const frames: TunnelFrame[] = []
  const waiters: Array<{ pred: (f: TunnelFrame) => boolean; resolve: (f: TunnelFrame) => void }> = []
  let proxySocket: WebSocket
  let ready: Promise<void>

  function waitFor(pred: (f: TunnelFrame) => boolean): Promise<TunnelFrame> {
    const found = frames.find(pred)
    if (found) return Promise.resolve(found)
    return new Promise((resolve) => waiters.push({ pred, resolve }))
  }
  function flush(): void {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i]!
      const f = frames.find(w.pred)
      if (f) { w.resolve(f); waiters.splice(i, 1) }
    }
  }
  function proxySend(header: TunnelFrameHeader, payload?: Uint8Array): void {
    proxySocket.send(encodeFrame(header, payload))
  }
  async function httpBody(id: number): Promise<string> {
    await waitFor((f) => f.header.t === "http-res-end" && f.header.id === id)
    const parts = frames
      .filter((f) => f.header.t === "http-res-chunk" && f.header.id === id)
      .map((f) => f.payload)
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) { out.set(p, offset); offset += p.length }
    return textOf(out)
  }

  beforeAll(async () => {
    // ── Loopback target: a real Huxflux-shaped HTTP + WS server ──────────────
    loopback = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/ping") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
        return
      }
      if (req.method === "POST" && req.url === "/api/echo") {
        const chunks: Buffer[] = []
        req.on("data", (c: Buffer) => chunks.push(c))
        req.on("end", () => {
          res.writeHead(200, { "content-type": "application/json" })
          res.end(Buffer.concat(chunks))
        })
        return
      }
      res.writeHead(404).end()
    })
    loopbackWss = new WebSocketServer({ server: loopback })
    loopbackWss.on("connection", (ws, req) => {
      // Echo every message, tagging with the path so the test can prove the
      // upstream path (query string included) survived the tunnel.
      ws.send(`path:${req.url}`)
      ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary }))
    })
    await new Promise<void>((r) => loopback.listen(0, "127.0.0.1", r))
    const loopbackPort = (loopback.address() as AddressInfo).port

    // ── Fake proxy: accept the tunnel, answer register, record client frames ──
    proxy = new WebSocketServer({ port: 0 })
    let markReady!: () => void
    ready = new Promise<void>((r) => { markReady = r })
    proxy.on("connection", (ws) => {
      proxySocket = ws
      ws.on("message", (data) => {
        const frame = decodeFrame(data as Buffer)
        if (frame.header.t === "register") {
          ws.send(encodeFrame({ t: "registered", version: "test" }))
          markReady()
          return
        }
        frames.push(frame)
        flush()
      })
    })
    await new Promise<void>((r) => proxy.on("listening", r))
    const proxyPort = (proxy.address() as AddressInfo).port

    client = new TunnelClient({
      proxyUrl: `ws://127.0.0.1:${proxyPort}`,
      serverId: "test-server",
      loopbackBase: `http://127.0.0.1:${loopbackPort}`,
    })
    client.start()
    await ready
  })

  afterAll(async () => {
    client.stop()
    await new Promise<void>((r) => proxy.close(() => r()))
    await new Promise<void>((r) => loopbackWss.close(() => r()))
    await new Promise<void>((r) => loopback.close(() => r()))
  })

  it("tunnels a GET request and streams the response back", async () => {
    proxySend({ t: "http-open", id: 1, method: "GET", path: "/api/ping", headers: {} })
    proxySend({ t: "http-req-end", id: 1 })

    const resFrame = await waitFor((f) => f.header.t === "http-res" && f.header.id === 1)
    expect(resFrame.header.t === "http-res" && resFrame.header.status).toBe(200)
    expect(await httpBody(1)).toBe(JSON.stringify({ ok: true }))
  })

  it("tunnels a POST body through and echoes it", async () => {
    const payload = JSON.stringify({ hello: "wörld" })
    proxySend({ t: "http-open", id: 2, method: "POST", path: "/api/echo", headers: { "content-type": "application/json" } })
    proxySend({ t: "http-req-chunk", id: 2 }, textBytes(payload))
    proxySend({ t: "http-req-end", id: 2 })

    expect(await httpBody(2)).toBe(payload)
  })

  it("returns a 502-style abort when the upstream path errors", async () => {
    proxySend({ t: "http-open", id: 3, method: "GET", path: "/api/missing", headers: {} })
    proxySend({ t: "http-req-end", id: 3 })

    const res = await waitFor((f) => f.header.t === "http-res" && f.header.id === 3)
    expect(res.header.t === "http-res" && res.header.status).toBe(404)
  })

  it("tunnels a WebSocket, preserving the upstream path and echoing messages", async () => {
    proxySend({ t: "ws-open", id: 4, path: "/ws?token=abc", headers: {} })
    await waitFor((f) => f.header.t === "ws-open-ack" && f.header.id === 4)

    // The loopback server greets with the path it saw — proves query survived.
    const greeting = await waitFor((f) => f.header.t === "ws-data" && f.header.id === 4)
    expect(textOf(greeting.payload)).toBe("path:/ws?token=abc")

    proxySend({ t: "ws-data", id: 4, binary: false }, textBytes("ping"))
    const echo = await waitFor(
      (f) => f.header.t === "ws-data" && f.header.id === 4 && textOf(f.payload) === "ping"
    )
    expect(textOf(echo.payload)).toBe("ping")

    proxySend({ t: "ws-close", id: 4, code: 1000 })
  })
})
