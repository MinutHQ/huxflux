import type { IncomingMessage, ServerResponse } from "node:http"
import { getTunnel } from "./registry.js"
import type { HttpStreamHandlers } from "./tunnel.js"
import {
  sanitizeRequestHeaders,
  sanitizeResponseHeaders,
  sendError,
  toUint8Array,
} from "./util.js"

// Tunnel one client HTTP request to a connected server and stream its response
// back. The request body is streamed as it arrives; the response is streamed as
// frames come back, so large diffs / uploads never fully buffer in the proxy.
export function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  serverId: string,
  upstreamPath: string,
): void {
  const tunnel = getTunnel(serverId)
  if (!tunnel) {
    sendError(res, 502, `server '${serverId}' is not connected`)
    return
  }

  let finished = false
  const finish = () => { finished = true }

  const handlers: HttpStreamHandlers = {
    onResponse(status, headers) {
      res.writeHead(status, sanitizeResponseHeaders(headers))
    },
    onChunk(payload) {
      res.write(payload)
    },
    onEnd() {
      finish()
      tunnel.releaseHttp(id)
      res.end()
    },
    onAbort(reason) {
      finish()
      tunnel.releaseHttp(id)
      if (!res.headersSent) sendError(res, 502, reason ?? "upstream aborted")
      else res.destroy()
    },
  }

  const id = tunnel.openHttpStream(handlers)
  tunnel.send({
    t: "http-open",
    id,
    method: req.method ?? "GET",
    path: upstreamPath,
    headers: sanitizeRequestHeaders(req.headers),
  })

  req.on("data", (chunk: Buffer) => tunnel.send({ t: "http-req-chunk", id }, toUint8Array(chunk)))
  req.on("end", () => tunnel.send({ t: "http-req-end", id }))
  req.on("error", () => {
    if (finished) return
    finish()
    tunnel.send({ t: "http-abort", id, reason: "client request error" })
    tunnel.releaseHttp(id)
  })

  // Client hung up before the response completed — tell the server to abort.
  res.on("close", () => {
    if (finished) return
    finish()
    tunnel.send({ t: "http-abort", id, reason: "client disconnected" })
    tunnel.releaseHttp(id)
  })
}
