import { WebSocket } from "ws"
import type { TunnelFrameHeader } from "@huxflux/shared/proxy"
import { toUint8Array } from "./bytes.js"

type SendFrame = (header: TunnelFrameHeader, payload?: Uint8Array) => void

// WebSocket handshake headers must not be forwarded to the new upstream socket
// — the `ws` client generates its own. Everything else (auth, cookies) is kept,
// though Huxflux carries its token in the URL query rather than a header.
const STRIP_WS = new Set([
  "host", "connection", "upgrade", "sec-websocket-key", "sec-websocket-version",
  "sec-websocket-extensions", "sec-websocket-protocol", "sec-websocket-accept",
])

function upstreamHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!STRIP_WS.has(key.toLowerCase())) out[key] = value
  }
  return out
}

export interface LoopbackWsStream {
  data(payload: Uint8Array, binary: boolean): void
  close(code?: number, reason?: string): void
}

// Opens a loopback WebSocket to the local server for one tunneled client
// socket, piping frames both ways. Client→upstream frames that arrive before
// the upstream is open are queued and flushed on open.
export function createLoopbackWsStream(
  base: string,
  id: number,
  header: Extract<TunnelFrameHeader, { t: "ws-open" }>,
  send: SendFrame,
  onDone: () => void,
): LoopbackWsStream {
  const wsBase = base.replace(/^http/, "ws")
  const upstream = new WebSocket(wsBase + header.path, { headers: upstreamHeaders(header.headers) })
  let open = false
  let done = false
  const queue: Array<{ payload: Uint8Array; binary: boolean }> = []

  const finish = () => {
    if (done) return
    done = true
    onDone()
  }

  upstream.on("open", () => {
    open = true
    send({ t: "ws-open-ack", id })
    for (const m of queue) upstream.send(m.payload, { binary: m.binary })
    queue.length = 0
  })
  upstream.on("message", (data, isBinary) => {
    send({ t: "ws-data", id, binary: isBinary }, toUint8Array(data))
  })
  upstream.on("close", (code, reason) => {
    send({ t: "ws-close", id, code, reason: reason.toString() })
    finish()
  })
  upstream.on("error", (err: Error) => {
    if (!open) send({ t: "ws-open-fail", id, reason: err.message })
    finish()
  })

  return {
    data(payload, binary) {
      if (open) upstream.send(payload, { binary })
      else queue.push({ payload, binary })
    },
    close(code, reason) {
      try { upstream.close(code, reason) } catch { /* already closing */ }
    },
  }
}
