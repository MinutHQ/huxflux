import * as http from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocketServer, type WebSocket } from "ws"
import { encodeFrame, decodeFrame, TUNNEL_PATH, OAUTH_PATHS } from "@huxflux/shared/proxy"
import { config, PROXY_VERSION, isOAuthConfigured } from "./config.js"
import { logger } from "./logger.js"
import { authenticateServerToken, authorizeClient } from "./auth.js"
import { Tunnel } from "./tunnel.js"
import { registerTunnel, unregisterTunnel, tunnelCount } from "./registry.js"
import { handleHttpRequest } from "./httpProxy.js"
import { handleWsUpgrade } from "./wsProxy.js"
import { parseServerPath, pathOf, sendError, rejectUpgrade, toUint8Array } from "./util.js"
import { handleOAuthStart, handleAuthorize, handleCallback, handleToken } from "./oauth/handlers.js"

const wss = new WebSocketServer({ noServer: true })

/** OAuth + health endpoints. Returns true if the request was handled here. */
async function handleServiceRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname
  // CORS preflight. Browsers send OPTIONS with no auth for any request carrying
  // a custom header (the proxy-auth header) or a JSON body (the OAuth token
  // endpoint), so it must be answered here, before the auth gate. Actual
  // responses get their CORS headers from the tunneled server (or sendJson).
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-huxflux-proxy-authorization",
      "access-control-max-age": "600",
    })
    res.end()
    return true
  }
  if (path === "/health") {
    const body = JSON.stringify({ status: "ok", servers: tunnelCount(), version: PROXY_VERSION })
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) })
    res.end(body)
    return true
  }
  if (path === OAUTH_PATHS.start && req.method === "POST") { handleOAuthStart(res); return true }
  if (path === OAUTH_PATHS.authorize && req.method === "GET") { handleAuthorize(res, url); return true }
  if (path === OAUTH_PATHS.callback && req.method === "GET") { await handleCallback(res, url); return true }
  if (path === OAUTH_PATHS.token && req.method === "POST") { await handleToken(req, res); return true }
  return false
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res)
})

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost")
  if (await handleServiceRoutes(req, res, url)) return

  const parsed = parseServerPath(req.url ?? "/")
  if (!parsed) { sendError(res, 404, "not found — expected /s/<serverId>/..."); return }
  const email = await authorizeClient(req)
  if (!email) { sendError(res, 401, "unauthorized"); return }
  handleHttpRequest(req, res, email, parsed.serverId, parsed.upstreamPath)
}

server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  void handleUpgrade(req, socket, head)
})

async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  const url = req.url ?? "/"
  if (pathOf(url) === TUNNEL_PATH) { handleTunnelUpgrade(req, socket, head); return }
  const parsed = parseServerPath(url)
  if (!parsed) { rejectUpgrade(socket, 404, "Not Found"); return }
  const email = await authorizeClient(req)
  if (!email) { rejectUpgrade(socket, 401, "Unauthorized"); return }
  handleWsUpgrade(wss, req, socket, head, email, parsed.serverId, parsed.upstreamPath)
}

// A Huxflux server dialing in. The first frame must be a `register` carrying a
// valid access token; the proxy derives the owner email and namespaces the
// registration under it.
function handleTunnelUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    ws.once("message", (data) => { void onRegisterFrame(ws, data) })
  })
}

async function onRegisterFrame(ws: WebSocket, data: unknown): Promise<void> {
  let header
  try {
    header = decodeFrame(toUint8Array(data)).header
  } catch {
    ws.close(1002, "malformed register frame")
    return
  }
  if (header.t !== "register") { ws.close(1002, "expected register frame"); return }
  const email = await authenticateServerToken(header.accessToken)
  if (!email) {
    ws.send(encodeFrame({ t: "register-failed", reason: "unauthorized" }))
    ws.close(4401, "unauthorized")
    return
  }
  ws.send(encodeFrame({ t: "registered", version: PROXY_VERSION }))
  const tunnel = new Tunnel(email, header.serverId, ws)
  registerTunnel(email, header.serverId, tunnel)
  tunnel.onClosed(() => {
    unregisterTunnel(email, header.serverId, tunnel)
    logger.info(`server disconnected: ${header.serverId} (${email}) (${tunnelCount()} connected)`)
  })
  logger.info(`server registered: ${header.serverId} (${email}) (${tunnelCount()} connected)`)
}

server.listen(config.port, config.host, () => {
  logger.info(`listening on ${config.host}:${config.port}`)
  logger.info(`tunnel endpoint: ${TUNNEL_PATH} · client prefix: /s/<serverId>/...`)
  if (!isOAuthConfigured()) {
    logger.warn("OAuth is not configured (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PROXY_ALLOWED_DOMAIN, PROXY_PUBLIC_URL); the sign-in flow will return 503")
  } else {
    logger.info(`OAuth enabled · allowed domains: ${config.allowedDomains.join(", ")}`)
  }
})

function shutdown(signal: string): void {
  logger.info(`received ${signal}; shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
