import { config } from "../../config.js"
import { logger } from "../../logger.js"
import { TunnelClient } from "./service/tunnelClient.js"

// Public surface for the internet proxy tunnel. When configured, the server
// dials out to a public proxy so clients can reach it through NAT. All the
// multiplexing lives in service/; this file is just lifecycle + wiring.

let client: TunnelClient | null = null

/** True when PROXY_URL + PROXY_SERVER_ID are configured. */
export function isProxyConfigured(): boolean {
  return Boolean(config.proxyUrl && config.proxyServerId)
}

/** Dial the proxy (idempotent). No-op when not configured. */
export function startProxyConnector(): void {
  if (!isProxyConfigured() || client) return
  client = new TunnelClient({
    proxyUrl: config.proxyUrl,
    serverId: config.proxyServerId,
    secret: config.proxySecret || undefined,
    loopbackBase: `http://127.0.0.1:${config.boundPort}`,
  })
  client.start()
  logger.info({ serverId: config.proxyServerId }, "[proxy] connector started")
}

/** Tear down the tunnel (used on shutdown). */
export function stopProxyConnector(): void {
  client?.stop()
  client = null
}

/**
 * The connect string a user pastes into a client to reach this server through
 * the proxy: `<httpProxyBase>/s/<serverId>?token=<authToken>`. Null unless the
 * proxy is configured and auth is set (a token-less proxy URL is not useful).
 */
export function proxyClientConnectString(): string | null {
  if (!isProxyConfigured() || !config.authToken) return null
  const httpBase = config.proxyUrl.replace(/^ws/, "http").replace(/\/+$/, "")
  return `${httpBase}/s/${config.proxyServerId}?token=${config.authToken}`
}
