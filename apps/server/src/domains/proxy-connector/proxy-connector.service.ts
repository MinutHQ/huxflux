import { config } from "../../config.js"
import { logger } from "../../logger.js"
import { TunnelClient } from "./service/tunnelClient.js"
import { getValidAccessToken } from "./service/proxyAuthFlow.js"
import { invalidateStoredAccess } from "./service/proxyAuthStore.js"

// Public surface for the internet proxy tunnel. When configured, the server
// dials out to a public proxy so clients can reach it through NAT. All the
// multiplexing lives in service/; this file is just lifecycle + wiring.

let client: TunnelClient | null = null

/** True when PROXY_URL + PROXY_SERVER_ID are configured. */
export function isProxyConfigured(): boolean {
  return Boolean(config.proxyUrl && config.proxyServerId)
}

/** The proxy's http(s) base (OAuth endpoints live there, not on the ws URL). */
function proxyHttpBase(): string {
  return config.proxyUrl.replace(/^ws/, "http").replace(/\/+$/, "")
}

/** Dial the proxy (idempotent). No-op when not configured. */
export function startProxyConnector(): void {
  if (!isProxyConfigured() || client) return
  const httpBase = proxyHttpBase()
  client = new TunnelClient({
    proxyUrl: config.proxyUrl,
    serverId: config.proxyServerId,
    loopbackBase: `http://127.0.0.1:${config.boundPort}`,
    loopbackToken: config.authToken,
    getAccessToken: () => getValidAccessToken(httpBase),
    onAuthRejected: invalidateStoredAccess,
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
 * the proxy: `<httpProxyBase>/s/<serverId>`. No token — the client runs its own
 * OAuth sign-in against the proxy when it adds the server.
 */
export function proxyClientConnectString(): string | null {
  if (!isProxyConfigured()) return null
  return `${proxyHttpBase()}/s/${config.proxyServerId}`
}
