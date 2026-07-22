import * as http from "node:http"
import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocketServer, type WebSocket } from "ws"
import { encodeFrame, decodeFrame, TUNNEL_PATH } from "@huxflux/shared/proxy"
import { config, PROXY_VERSION } from "./config.js"
import { logger } from "./logger.js"
import { authenticateServer, authorizeClient } from "./auth.js"
import { Tunnel } from "./tunnel.js"
import { registerTunnel, unregisterTunnel, tunnelCount } from "./registry.js"
import { handleHttpRequest } from "./httpProxy.js"
import { handleWsUpgrade } from "./wsProxy.js"
import { parseServerPath, pathOf, sendError, rejectUpgrade, toUint8Array } from "./util.js"

const wss = new WebSocketServer({ noServer: true })

const server = http.createServer((req, res) => {
  const url = req.url ?? "/"
  if (pathOf(url) === "/health") {
    const body = JSON.stringify({ status: "ok", servers: tunnelCount(), version: PROXY_VERSION })
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) })
    res.end(body)
    return
  }
  const parsed = parseServerPath(url)
  if (!parsed) {
    sendError(res, 404, "not found — expected /s/<serverId>/...")
    return
  }
  if (!authorizeClient(req)) {
    sendError(res, 401, "unauthorized")
    return
  }
  handleHttpRequest(req, res, parsed.serverId, parsed.upstreamPath)
})

server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  const url = req.url ?? "/"
  if (pathOf(url) === TUNNEL_PATH) {
    handleTunnelUpgrade(req, socket, head)
    return
  }
  const parsed = parseServerPath(url)
  if (!parsed) {
    rejectUpgrade(socket, 404, "Not Found")
    return
  }
  if (!authorizeClient(req)) {
    rejectUpgrade(socket, 401, "Unauthorized")
    return
  }
  handleWsUpgrade(wss, req, socket, head, parsed.serverId, parsed.upstreamPath)
})

// A Huxflux server dialing in. The first frame must be a `register`; only then
// is a Tunnel constructed and added to the registry.
function handleTunnelUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    ws.once("message", (data) => {
      let header
      try {
        header = decodeFrame(toUint8Array(data)).header
      } catch {
        ws.close(1002, "malformed register frame")
        return
      }
      if (header.t !== "register") {
        ws.close(1002, "expected register frame")
        return
      }
      if (!authenticateServer(header.secret)) {
        ws.send(encodeFrame({ t: "register-failed", reason: "unauthorized" }))
        ws.close(4401, "unauthorized")
        return
      }
      ws.send(encodeFrame({ t: "registered", version: PROXY_VERSION }))
      const tunnel = new Tunnel(header.serverId, ws)
      registerTunnel(header.serverId, tunnel)
      tunnel.onClosed(() => {
        unregisterTunnel(header.serverId, tunnel)
        logger.info(`server disconnected: ${header.serverId} (${tunnelCount()} connected)`)
      })
      logger.info(`server registered: ${header.serverId} (${tunnelCount()} connected)`)
    })
  })
}

server.listen(config.port, config.host, () => {
  logger.info(`listening on ${config.host}:${config.port}`)
  logger.info(`tunnel endpoint: ${TUNNEL_PATH} · client prefix: /s/<serverId>/...`)
  if (!config.serverSecret) logger.warn("PROXY_SERVER_SECRET unset — accepting any server registration")
  if (!config.clientToken) logger.warn("PROXY_CLIENT_TOKEN unset — accepting any client")
})

function shutdown(signal: string): void {
  logger.info(`received ${signal}; shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
