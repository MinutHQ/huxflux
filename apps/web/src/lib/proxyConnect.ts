import {
  addServer,
  setActiveServerId,
  parseConnectionString,
  proxyOriginOf,
  runProxyAuthFlow,
  type HuxfluxServer,
  type ProxyToken,
} from "@huxflux/shared"
import { openExternal } from "./platform"

// Web glue for connecting a server that lives behind the public proxy. The user
// pastes a proxy connect string (`https://proxy/s/<serverId>`); we run the
// OAuth device flow (opening Google sign-in in a browser tab), then store the
// resulting tokens on the server entry. Direct LAN servers do not go through
// here — they still use the URL + token form.

/** True when a pasted URL / connection string points at the proxy (`/s/` path). */
export function isProxyConnectString(input: string): boolean {
  const parsed = parseConnectionString(input)
  if (!parsed) return false
  try {
    return new URL(parsed.url).pathname.startsWith("/s/")
  } catch {
    return false
  }
}

export interface ConnectProxiedOptions {
  name?: string
  /** Invoked with the sign-in URL; defaults to opening a browser tab. */
  openBrowser?: (url: string) => void
}

/**
 * Runs the proxy sign-in flow for a connect string and adds the server. Resolves
 * once the user has authenticated in the browser and tokens are stored. Throws
 * if the input is not a proxy URL, or if sign-in is denied / times out.
 */
export async function connectProxiedServer(input: string, opts: ConnectProxiedOptions = {}): Promise<HuxfluxServer> {
  const parsed = parseConnectionString(input)
  if (!parsed) throw new Error("Could not parse that connection string.")
  const origin = proxyOriginOf(parsed.url)
  if (!origin || !new URL(parsed.url).pathname.startsWith("/s/")) {
    throw new Error("That URL is not a proxy address (expected /s/<serverId>).")
  }

  const token = await runProxyAuthFlow(origin, opts.openBrowser ?? openExternal)

  const server = addServer({
    name: opts.name?.trim() || token.email || "Proxied Server",
    url: parsed.url,
    proxyAccessToken: token.accessToken,
    proxyRefreshToken: token.refreshToken,
    proxyAccountEmail: token.email,
  })
  setActiveServerId(server.id)
  return server
}

/** The proxy origin (`https://proxy.example.com`) from a pasted base URL, or null. */
export function normalizeProxyBase(input: string): string | null {
  const trimmed = input.trim()
  try {
    return new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).origin
  } catch {
    return null
  }
}

/** Sign in to a proxy by base URL and return the tokens (adds no server yet). */
export function signInToProxy(baseOrigin: string, openBrowser: (url: string) => void = openExternal): Promise<ProxyToken> {
  return runProxyAuthFlow(baseOrigin, openBrowser)
}

/** Add a specific server discovered on a proxy, reusing tokens from sign-in. */
export function addProxiedServerEntry(args: {
  baseOrigin: string
  serverId: string
  token: ProxyToken
  name?: string
}): HuxfluxServer {
  const server = addServer({
    name: args.name?.trim() || args.serverId,
    url: `${args.baseOrigin}/s/${args.serverId}`,
    proxyAccessToken: args.token.accessToken,
    proxyRefreshToken: args.token.refreshToken,
    proxyAccountEmail: args.token.email,
  })
  setActiveServerId(server.id)
  return server
}
