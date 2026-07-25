import { refreshProxyToken, runProxyAuthFlow, type ProxyToken } from "@huxflux/shared"
import { logger } from "../../../logger.js"
import { loadProxyAuth, patchProxyAuth } from "./proxyAuthStore.js"

// Obtains a valid proxy access token for the connector, running the interactive
// device flow only when necessary. `proxyHttpBase` is the proxy's http(s) URL
// (the OAuth endpoints live there, not on the ws tunnel URL).

const REFRESH_MARGIN_MS = 60_000

// Merge tokens into the store (preserving serverKey / prior refresh token).
function store(token: ProxyToken): string {
  patchProxyAuth({
    accessToken: token.accessToken,
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
    ...(token.email ? { email: token.email } : {}),
    accessExpiresAt: Date.now() + token.expiresIn * 1000,
  })
  return token.accessToken
}

async function deviceFlow(proxyHttpBase: string): Promise<string> {
  const token = await runProxyAuthFlow(proxyHttpBase, (url) => {
    console.info(`\n  Proxy sign-in required. Open this URL in a browser to connect this server:\n\n    ${url}\n`)
    logger.info({ url }, "[proxy] awaiting interactive sign-in")
  })
  logger.info({ email: token.email }, "[proxy] signed in")
  return store(token)
}

/** Returns a currently-valid access token, refreshing or re-authenticating as
 * needed. Blocks on the interactive flow the first time (or after revocation). */
export async function getValidAccessToken(proxyHttpBase: string): Promise<string> {
  const stored = loadProxyAuth()
  if (stored?.accessToken && (stored.accessExpiresAt ?? 0) - REFRESH_MARGIN_MS > Date.now()) {
    return stored.accessToken
  }
  if (stored?.refreshToken) {
    const refreshed = await refreshProxyToken(proxyHttpBase, stored.refreshToken)
    if (refreshed) return store(refreshed)
    logger.warn("[proxy] refresh token rejected; re-authenticating")
  }
  return deviceFlow(proxyHttpBase)
}
