import { refreshProxyToken, runProxyAuthFlow } from "@huxflux/shared"
import { logger } from "../../../logger.js"
import { loadProxyAuth, saveProxyAuth, type StoredProxyAuth } from "./proxyAuthStore.js"

// Obtains a valid proxy access token for the connector, running the interactive
// device flow only when necessary. `proxyHttpBase` is the proxy's http(s) URL
// (the OAuth endpoints live there, not on the ws tunnel URL).

const REFRESH_MARGIN_MS = 60_000

function store(token: { accessToken: string; refreshToken?: string; email?: string; expiresIn: number }, fallback: StoredProxyAuth | null): StoredProxyAuth {
  const next: StoredProxyAuth = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? fallback?.refreshToken ?? "",
    email: token.email ?? fallback?.email ?? "",
    accessExpiresAt: Date.now() + token.expiresIn * 1000,
  }
  saveProxyAuth(next)
  return next
}

async function deviceFlow(proxyHttpBase: string): Promise<StoredProxyAuth> {
  const token = await runProxyAuthFlow(proxyHttpBase, (url) => {
    console.info(`\n  Proxy sign-in required. Open this URL in a browser to connect this server:\n\n    ${url}\n`)
    logger.info({ url }, "[proxy] awaiting interactive sign-in")
  })
  logger.info({ email: token.email }, "[proxy] signed in")
  return store(token, null)
}

/** Returns a currently-valid access token, refreshing or re-authenticating as
 * needed. Blocks on the interactive flow the first time (or after revocation). */
export async function getValidAccessToken(proxyHttpBase: string): Promise<string> {
  const stored = loadProxyAuth()
  if (stored?.accessToken && stored.accessExpiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return stored.accessToken
  }
  if (stored?.refreshToken) {
    const refreshed = await refreshProxyToken(proxyHttpBase, stored.refreshToken)
    if (refreshed) return store(refreshed, stored).accessToken
    logger.warn("[proxy] refresh token rejected; re-authenticating")
  }
  return (await deviceFlow(proxyHttpBase)).accessToken
}
