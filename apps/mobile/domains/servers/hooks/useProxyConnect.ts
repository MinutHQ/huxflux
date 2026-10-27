import { useEffect, useRef, useState } from "react"
import { Linking } from "react-native"
import {
  addServer, updateServer, setActiveServerId, proxyOriginOf,
  runProxyAuthFlow, fetchProxyServers,
  type HuxfluxServer, type ProxyServerInfo, type ProxyToken,
} from "@huxflux/shared"

export type ProxyConnectStep = "url" | "select"

/** The proxy origin (`https://proxy.example.com`) from a typed base URL, or null. */
function normalizeProxyBase(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    return new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).origin
  } catch {
    return null
  }
}

/** Set `cancelled` to stop an in-flight sign-in at its next poll. */
export interface SignInCancel {
  cancelled: boolean
}

/**
 * Runs the proxy's device-style sign-in in the system browser (Safari on
 * iOS). The system browser survives switching to an authenticator app for
 * 2FA, which an in-app browser sheet does not. JS timers pause while Huxflux
 * is backgrounded, so polling picks up the token once the user switches back.
 */
async function signInWithSystemBrowser(origin: string, cancel: SignInCancel): Promise<ProxyToken> {
  const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
    setTimeout(() => (cancel.cancelled ? reject(new Error("Sign-in cancelled.")) : resolve()), ms)
  })
  return runProxyAuthFlow(origin, (url) => { void Linking.openURL(url) }, sleep)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Sign-in failed."
}

/**
 * Drives "add via proxy": enter the proxy base URL, sign in with Google in
 * Safari, then pick one of the account's registered servers. The
 * chosen server is stored with its proxy tokens and becomes active.
 */
export function useProxyConnect(onConnected: () => void) {
  const [step, setStep] = useState<ProxyConnectStep>("url")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const [token, setToken] = useState<ProxyToken | null>(null)
  const [servers, setServers] = useState<ProxyServerInfo[]>([])
  const cancelRef = useRef<SignInCancel | null>(null)

  // Leaving the form (Cancel, or closing the Servers screen) stops polling.
  useEffect(() => () => { if (cancelRef.current) cancelRef.current.cancelled = true }, [])

  async function signIn(url: string) {
    if (loading) return
    const base = normalizeProxyBase(url)
    if (!base) { setError("Enter a valid proxy URL."); return }
    setError(null)
    setLoading(true)
    const cancel: SignInCancel = { cancelled: false }
    cancelRef.current = cancel
    try {
      const t = await signInWithSystemBrowser(base, cancel)
      const list = await fetchProxyServers(base, t.accessToken)
      setOrigin(base)
      setToken(t)
      setServers(list)
      setStep("select")
    } catch (err) {
      if (!cancel.cancelled) setError(errorMessage(err))
    } finally {
      if (cancelRef.current === cancel) cancelRef.current = null
      setLoading(false)
    }
  }

  /** Stops a sign-in that is waiting on the browser. */
  function cancelSignIn() {
    if (cancelRef.current) cancelRef.current.cancelled = true
  }

  function select(info: ProxyServerInfo) {
    if (!token) return
    const server = addServer({
      name: info.name || info.serverId,
      url: `${origin}/s/${info.serverId}`,
      proxyAccessToken: token.accessToken,
      proxyRefreshToken: token.refreshToken,
      proxyAccountEmail: token.email,
    })
    setActiveServerId(server.id)
    onConnected()
  }

  return { step, loading, error, token, servers, signIn, cancelSignIn, select, clearError: () => setError(null) }
}

/**
 * Re-runs proxy sign-in for an existing proxied server whose tokens no longer
 * work, and stores the fresh tokens on it. Resolves to an error message, or
 * null on success or cancellation.
 */
export async function reauthProxyServer(server: HuxfluxServer, cancel: SignInCancel): Promise<string | null> {
  const origin = proxyOriginOf(server.url)
  if (!origin) return "This server's proxy address is invalid."
  try {
    const t = await signInWithSystemBrowser(origin, cancel)
    updateServer(server.id, {
      proxyAccessToken: t.accessToken,
      ...(t.refreshToken ? { proxyRefreshToken: t.refreshToken } : {}),
      proxyAccountEmail: t.email,
    })
    return null
  } catch (err) {
    return cancel.cancelled ? null : errorMessage(err)
  }
}
