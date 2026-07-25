import { WebSocket } from "ws"
import {
  encodeFrame,
  decodeFrame,
  TUNNEL_PATH,
  type StreamId,
  type TunnelFrameHeader,
} from "@huxflux/shared/proxy"
import { logger } from "../../../logger.js"
import { SERVER_VERSION } from "../../../version.js"
import { toUint8Array } from "./bytes.js"
import { createLoopbackHttpStream, type LoopbackHttpStream } from "./loopbackHttp.js"
import { createLoopbackWsStream, type LoopbackWsStream } from "./loopbackWs.js"

export interface TunnelClientOptions {
  /** Proxy base URL, e.g. wss://proxy.example.com. The tunnel path is appended. */
  proxyUrl: string
  /** Stable random key; the proxy derives the public URL id from it. */
  serverKey: string
  /** Human label shown to clients (hostname by default). Never in the URL. */
  name: string
  /** Local origin the loopback requests target, e.g. http://127.0.0.1:4321. */
  loopbackBase: string
  /** The server's own auth token, injected on the loopback leg so tunneled
   * client traffic (which authenticated to the proxy, not the server) passes. */
  loopbackToken: string
  /** Supplies a valid proxy access token, refreshing / re-authenticating as needed. */
  getAccessToken: () => Promise<string>
  /** Called when the proxy rejects our token so the next attempt re-authenticates. */
  onAuthRejected?: () => void
  /** Called on successful registration with the proxy-derived public server id. */
  onRegistered?: (serverId: string | undefined) => void
}

const MAX_BACKOFF_MS = 30_000

// Maintains the outbound tunnel to the proxy. Owns reconnection and dispatches
// every inbound frame to a loopback HTTP or WebSocket stream against the local
// server. The proxy allocates all stream ids, so this side only ever looks ids
// up — it never generates them.
export class TunnelClient {
  private ws: WebSocket | null = null
  private stopped = false
  private backoff = 1_000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly httpStreams = new Map<StreamId, LoopbackHttpStream>()
  private readonly wsStreams = new Map<StreamId, LoopbackWsStream>()

  constructor(private readonly opts: TunnelClientOptions) {}

  start(): void {
    this.stopped = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    try { this.ws?.close(1000, "server shutting down") } catch { /* noop */ }
    this.ws = null
  }

  private readonly send = (header: TunnelFrameHeader, payload?: Uint8Array): void => {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeFrame(header, payload))
  }

  private async connect(): Promise<void> {
    let accessToken: string
    try {
      accessToken = await this.opts.getAccessToken()
    } catch (err) {
      logger.error({ err }, "[proxy] could not obtain access token")
      this.scheduleReconnect()
      return
    }
    if (this.stopped) return

    const url = this.opts.proxyUrl.replace(/\/+$/, "") + TUNNEL_PATH
    const ws = new WebSocket(url)
    this.ws = ws
    ws.on("open", () => {
      logger.info({ proxy: url, name: this.opts.name }, "[proxy] tunnel connected; registering")
      this.send({ t: "register", serverKey: this.opts.serverKey, name: this.opts.name, accessToken, version: SERVER_VERSION })
    })
    ws.on("message", (data) => this.onMessage(toUint8Array(data)))
    ws.on("close", () => this.onClose())
    ws.on("error", (err: Error) => logger.warn({ err }, "[proxy] tunnel socket error"))
  }

  private onMessage(data: Uint8Array): void {
    let header: TunnelFrameHeader
    let payload: Uint8Array
    try {
      const frame = decodeFrame(data)
      header = frame.header
      payload = frame.payload
    } catch {
      logger.warn("[proxy] dropped malformed frame from proxy")
      return
    }
    switch (header.t) {
      case "registered":
        this.backoff = 1_000
        this.opts.onRegistered?.(header.serverId)
        logger.info({ name: this.opts.name, serverId: header.serverId }, "[proxy] registered with proxy")
        break
      case "register-failed":
        // Token invalid / expired: drop it and reconnect; getAccessToken will
        // refresh or re-run the sign-in flow on the next attempt.
        logger.warn({ reason: header.reason }, "[proxy] registration rejected; re-authenticating")
        this.opts.onAuthRejected?.()
        try { this.ws?.close() } catch { /* noop */ }
        break
      case "http-open": {
        const stream = createLoopbackHttpStream(this.opts.loopbackBase, header.id, header, this.send, this.opts.loopbackToken)
        this.httpStreams.set(header.id, stream)
        break
      }
      case "http-req-chunk":
        this.httpStreams.get(header.id)?.pushChunk(payload)
        break
      case "http-req-end": {
        const stream = this.httpStreams.get(header.id)
        if (stream) void stream.end().finally(() => this.httpStreams.delete(header.id))
        break
      }
      case "http-abort": {
        this.httpStreams.get(header.id)?.abort()
        this.httpStreams.delete(header.id)
        break
      }
      case "ws-open": {
        const stream = createLoopbackWsStream(
          this.opts.loopbackBase, header.id, header, this.send,
          () => this.wsStreams.delete(header.id),
          this.opts.loopbackToken,
        )
        this.wsStreams.set(header.id, stream)
        break
      }
      case "ws-data":
        this.wsStreams.get(header.id)?.data(payload, header.binary)
        break
      case "ws-close": {
        this.wsStreams.get(header.id)?.close(header.code, header.reason)
        this.wsStreams.delete(header.id)
        break
      }
      default:
        // response-direction frames the server itself emits; never received here
        break
    }
  }

  private onClose(): void {
    for (const stream of this.httpStreams.values()) stream.abort()
    for (const stream of this.wsStreams.values()) stream.close(1011, "tunnel closed")
    this.httpStreams.clear()
    this.wsStreams.clear()
    this.ws = null
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = this.backoff
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS)
    logger.warn({ delayMs: delay }, "[proxy] tunnel down; reconnecting")
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) void this.connect()
    }, delay)
    this.reconnectTimer.unref?.()
  }
}
