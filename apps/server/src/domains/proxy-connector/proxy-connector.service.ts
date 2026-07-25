import { config } from "../../config.js"
import { logger } from "../../logger.js"
import { TunnelClient } from "./service/tunnelClient.js"
import { getValidAccessToken } from "./service/proxyAuthFlow.js"
import { invalidateStoredAccess, getOrCreateServerKey } from "./service/proxyAuthStore.js"

// Public surface for the internet proxy tunnel. When configured, the server
// dials out to a public proxy so clients can reach it through NAT. All the
// multiplexing lives in service/; this file is just lifecycle + wiring.

let client: TunnelClient | null = null

/** True when PROXY_URL is configured. */
export function isProxyConfigured(): boolean {
  return Boolean(config.proxyUrl)
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
    serverKey: getOrCreateServerKey(),
    name: config.proxyServerName,
    loopbackBase: `http://127.0.0.1:${config.boundPort}`,
    loopbackToken: config.authToken,
    getAccessToken: () => getValidAccessToken(httpBase),
    onAuthRejected: invalidateStoredAccess,
    onRegistered: (serverId) => {
      if (serverId) console.info(`\n  Reachable via proxy as "${config.proxyServerName}": ${httpBase}/s/${serverId}\n`)
    },
  })
  client.start()
  logger.info({ name: config.proxyServerName }, "[proxy] connector started")
}

/** Tear down the tunnel (used on shutdown). */
export function stopProxyConnector(): void {
  client?.stop()
  client = null
}

/**
 * The proxy base URL a user points a client at to reach this server. The user
 * signs in and picks this server by name from the list — the per-server URL id
 * is derived by the proxy, not known ahead of registration.
 */
export function proxyClientConnectString(): string | null {
  if (!isProxyConfigured()) return null
  return proxyHttpBase()
}
