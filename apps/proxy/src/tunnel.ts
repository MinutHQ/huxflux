import type { WebSocket } from "ws"
import {
  encodeFrame,
  decodeFrame,
  type StreamId,
  type TunnelFrameHeader,
} from "@huxflux/shared/proxy"
import { logger } from "./logger.js"
import { toUint8Array } from "./util.js"

// Handlers a client HTTP request registers to receive the server's response.
export interface HttpStreamHandlers {
  onResponse(status: number, headers: Record<string, string>): void
  onChunk(payload: Uint8Array): void
  onEnd(): void
  onAbort(reason?: string): void
}

// Handlers a client WebSocket registers to receive upstream frames.
export interface WsStreamHandlers {
  onOpenAck(): void
  onOpenFail(code: number | undefined, reason: string | undefined): void
  onData(payload: Uint8Array, binary: boolean): void
  onClose(code: number | undefined, reason: string | undefined): void
}

// One registered Huxflux server, reachable over a single WebSocket. Every
// client request/socket becomes a multiplexed stream identified by an id the
// proxy allocates (monotonic per tunnel, so ids never collide with the server).
export class Tunnel {
  private nextId: StreamId = 1
  private readonly httpStreams = new Map<StreamId, HttpStreamHandlers>()
  private readonly wsStreams = new Map<StreamId, WsStreamHandlers>()
  private closedListener: (() => void) | null = null

  constructor(readonly serverId: string, private readonly socket: WebSocket) {
    socket.on("message", (data) => this.onMessage(data))
    socket.on("close", () => this.onSocketClosed())
    socket.on("error", (err: Error) => logger.warn(`tunnel error (${serverId}):`, err.message))
  }

  onClosed(listener: () => void): void {
    this.closedListener = listener
  }

  send(header: TunnelFrameHeader, payload?: Uint8Array): void {
    if (this.socket.readyState !== this.socket.OPEN) return
    this.socket.send(encodeFrame(header, payload))
  }

  openHttpStream(handlers: HttpStreamHandlers): StreamId {
    const id = this.nextId++
    this.httpStreams.set(id, handlers)
    return id
  }

  openWsStream(handlers: WsStreamHandlers): StreamId {
    const id = this.nextId++
    this.wsStreams.set(id, handlers)
    return id
  }

  releaseHttp(id: StreamId): void { this.httpStreams.delete(id) }
  releaseWs(id: StreamId): void { this.wsStreams.delete(id) }

  close(code = 1000, reason = ""): void {
    try { this.socket.close(code, reason) } catch { /* already closing */ }
  }

  private onMessage(data: unknown): void {
    let header: TunnelFrameHeader
    let payload: Uint8Array
    try {
      const frame = decodeFrame(toUint8Array(data))
      header = frame.header
      payload = frame.payload
    } catch {
      logger.warn(`dropped malformed frame from ${this.serverId}`)
      return
    }
    switch (header.t) {
      case "http-res": this.httpStreams.get(header.id)?.onResponse(header.status, header.headers); break
      case "http-res-chunk": this.httpStreams.get(header.id)?.onChunk(payload); break
      case "http-res-end": this.httpStreams.get(header.id)?.onEnd(); break
      case "http-abort": this.httpStreams.get(header.id)?.onAbort(header.reason); break
      case "ws-open-ack": this.wsStreams.get(header.id)?.onOpenAck(); break
      case "ws-open-fail": this.wsStreams.get(header.id)?.onOpenFail(header.code, header.reason); break
      case "ws-data": this.wsStreams.get(header.id)?.onData(payload, header.binary); break
      case "ws-close": this.wsStreams.get(header.id)?.onClose(header.code, header.reason); break
      default:
        // register / http-open / etc. are client→server directions the proxy
        // never receives back; ignore defensively.
        break
    }
  }

  private onSocketClosed(): void {
    for (const h of this.httpStreams.values()) h.onAbort("tunnel closed")
    for (const h of this.wsStreams.values()) h.onClose(1011, "tunnel closed")
    this.httpStreams.clear()
    this.wsStreams.clear()
    this.closedListener?.()
  }
}
