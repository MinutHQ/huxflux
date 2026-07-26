import { refreshProxyToken, runProxyAuthFlow, type ProxyToken } from "@huxflux/shared"
import { logger } from "../../../logger.js"
import { loadProxyAuth, patchProxyAuth } from "./proxyAuthStore.js"

// Obtains a valid proxy access token for the connector, running the interactive
// device flow only when necessary. `proxyHttpBase` is the proxy's http(s) URL
// (the OAuth endpoints live there, not on the ws tunnel URL).

const REFRESH_MARGIN_MS = 60_000

/** The proxy's http(s) base for a given ws/wss proxy URL. OAuth endpoints live
 * on http(s), not on the ws tunnel URL. Trailing slashes are stripped. */
export function toProxyHttpBase(proxyUrl: string): string {
  return proxyUrl.replace(/^ws/, "http").replace(/\/+$/, "")
}

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

// Default browser prompt: surface the sign-in URL on the server log/console.
function logSignInUrl(url: string): void {
  console.info(`\n  Proxy sign-in required. Open this URL in a browser to connect this server:\n\n    ${url}\n`)
  logger.info({ url }, "[proxy] awaiting interactive sign-in")
}

// Run the interactive device flow and persist the resulting tokens.
async function deviceFlow(proxyHttpBase: string, onUrl: (url: string) => void): Promise<ProxyToken> {
  const token = await runProxyAuthFlow(proxyHttpBase, onUrl)
  logger.info({ email: token.email }, "[proxy] signed in")
  store(token)
  return token
}

/** Run the interactive sign-in against `proxyUrl` and persist the tokens so the
 * connector can start later without prompting. `onUrl` receives the browser
 * sign-in URL. Returns the signed-in email (empty when the proxy omits one).
 * Used by the CLI so first sign-in happens in the user's terminal, not buried
 * in the background server log. */
export async function authenticateProxy(proxyUrl: string, onUrl: (url: string) => void): Promise<string> {
  const token = await deviceFlow(toProxyHttpBase(proxyUrl), onUrl)
  return token.email ?? ""
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
  return (await deviceFlow(proxyHttpBase, logSignInUrl)).accessToken
}
