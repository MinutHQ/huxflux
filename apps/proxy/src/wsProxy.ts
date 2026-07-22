import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import type { WebSocketServer } from "ws"
import type { StreamId } from "@huxflux/shared/proxy"
import { getTunnel } from "./registry.js"
import type { WsStreamHandlers } from "./tunnel.js"
import { rejectUpgrade, sanitizeRequestHeaders, toUint8Array } from "./util.js"

// Tunnel one client WebSocket to a connected server (WebSocket-over-WebSocket).
// The client handshake completes immediately; client→server frames are buffered
// until the upstream socket acks its open, then flushed in order.
export function handleWsUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  serverId: string,
  upstreamPath: string,
): void {
  const tunnel = getTunnel(serverId)
  if (!tunnel) {
    rejectUpgrade(socket, 502, "server not connected")
    return
  }

  wss.handleUpgrade(req, socket, head, (client) => {
    let acked = false
    let closed = false
    const backlog: Array<{ payload: Uint8Array; binary: boolean }> = []
    let id: StreamId = 0

    const handlers: WsStreamHandlers = {
      onOpenAck() {
        acked = true
        for (const m of backlog) tunnel.send({ t: "ws-data", id, binary: m.binary }, m.payload)
        backlog.length = 0
      },
      onOpenFail(code, reason) {
        closed = true
        tunnel.releaseWs(id)
        try { client.close(code ?? 1011, reason ?? "upstream open failed") } catch { /* noop */ }
      },
      onData(payload, binary) {
        if (client.readyState === client.OPEN) client.send(payload, { binary })
      },
      onClose(code, reason) {
        closed = true
        tunnel.releaseWs(id)
        try { client.close(code ?? 1000, reason) } catch { /* noop */ }
      },
    }

    id = tunnel.openWsStream(handlers)
    tunnel.send({ t: "ws-open", id, path: upstreamPath, headers: sanitizeRequestHeaders(req.headers) })

    client.on("message", (data, isBinary) => {
      const payload = toUint8Array(data)
      if (acked) tunnel.send({ t: "ws-data", id, binary: isBinary }, payload)
      else backlog.push({ payload, binary: isBinary })
    })
    client.on("close", (code, reason) => {
      if (closed) return
      closed = true
      tunnel.send({ t: "ws-close", id, code, reason: reason.toString() })
      tunnel.releaseWs(id)
    })
    client.on("error", () => {
      if (closed) return
      closed = true
      tunnel.send({ t: "ws-close", id, reason: "client socket error" })
      tunnel.releaseWs(id)
    })
  })
}
