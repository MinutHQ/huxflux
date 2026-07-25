import {
  OAUTH_PATHS,
  PROXY_AUTH_HEADER,
  PROXY_SERVERS_PATH,
  proxyAuthStartSchema,
  proxyTokenSchema,
  proxyTokenErrorSchema,
  proxyServersResponseSchema,
  type ProxyAuthStart,
  type ProxyServerInfo,
  type ProxyToken,
  type ProxyTokenError,
} from "./proxy.types.js"

// Client-side driver for the proxy's OAuth device-style flow. Used by the web /
// desktop / mobile clients and by the server-side connector — all of which are
// OAuth clients of the proxy. Pure `fetch`, so it runs on every platform.

function trimBase(proxyBase: string): string {
  return proxyBase.replace(/\/+$/, "")
}

/** Start a flow. The caller opens `verificationUrl` in a browser, then polls. */
export async function startProxyAuth(proxyBase: string): Promise<ProxyAuthStart> {
  const res = await fetch(`${trimBase(proxyBase)}${OAUTH_PATHS.start}`, { method: "POST" })
  if (!res.ok) throw new Error(`proxy auth start failed: ${res.status}`)
  return proxyAuthStartSchema.parse(await res.json())
}

export type PollResult =
  | { status: "ok"; token: ProxyToken }
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" }

/** Poll once for the flow result. `pending` means keep polling. */
export async function pollProxyToken(proxyBase: string, authId: string): Promise<PollResult> {
  const res = await fetch(`${trimBase(proxyBase)}${OAUTH_PATHS.token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "device", authId }),
  })
  if (res.ok) return { status: "ok", token: proxyTokenSchema.parse(await res.json()) }
  const err = proxyTokenErrorSchema.safeParse(await res.json().catch(() => ({})))
  const code: ProxyTokenError | undefined = err.success ? err.data.error : undefined
  if (code === "authorization_pending" || code === "slow_down") return { status: "pending" }
  if (code === "denied") return { status: "denied" }
  return { status: "expired" }
}

/** List the servers currently registered for the token's owner. */
export async function fetchProxyServers(proxyBase: string, accessToken: string): Promise<ProxyServerInfo[]> {
  const res = await fetch(`${trimBase(proxyBase)}${PROXY_SERVERS_PATH}`, {
    headers: { [PROXY_AUTH_HEADER]: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`could not list proxy servers: ${res.status}`)
  return proxyServersResponseSchema.parse(await res.json()).servers
}

/** Exchange a refresh token for a fresh access token. Null if the refresh token
 * is no longer valid (revoked / expired) and the flow must be restarted. */
export async function refreshProxyToken(proxyBase: string, refreshToken: string): Promise<ProxyToken | null> {
  const res = await fetch(`${trimBase(proxyBase)}${OAUTH_PATHS.token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "refresh_token", refreshToken }),
  })
  if (!res.ok) return null
  return proxyTokenSchema.parse(await res.json())
}

/**
 * Drive a whole flow to completion: start, invoke `openBrowser` with the
 * verification URL, then poll until the user authorizes. Rejects on
 * denial / expiry. `sleep` is injectable so callers on platforms without a
 * global setTimeout-returning-promise can supply their own.
 */
export async function runProxyAuthFlow(
  proxyBase: string,
  openBrowser: (url: string) => void,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ProxyToken> {
  const start = await startProxyAuth(proxyBase)
  openBrowser(start.verificationUrl)
  const deadline = Date.now() + start.expiresIn * 1000
  let intervalMs = Math.max(1, start.interval) * 1000
  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const result = await pollProxyToken(proxyBase, start.authId)
    if (result.status === "ok") return result.token
    if (result.status === "denied") throw new Error("proxy authentication was denied")
    if (result.status === "expired") throw new Error("proxy authentication expired before completion")
    // pending → keep waiting, backing off slightly to be gentle on the proxy.
    intervalMs = Math.min(intervalMs + 1000, 10_000)
  }
  throw new Error("proxy authentication timed out")
}
