import { useState } from "react"
import { fetchProxyServers, type ProxyServerInfo, type ProxyToken } from "@huxflux/shared"
import { normalizeProxyBase, signInToProxy, addProxiedServerEntry } from "@/lib/proxyConnect"

export type ProxyConnectStep = "url" | "select"

/**
 * Drives the "connect via proxy" flow shared by the sidebar add-server form and
 * the first-run onboarding screen: enter a proxy URL, sign in through the
 * browser, then pick one of the user's registered servers by name. `onConnected`
 * runs after the chosen server is stored (reload, or advance onboarding).
 */
export function useProxyConnect(onConnected: () => void) {
  const [step, setStep] = useState<ProxyConnectStep>("url")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const [token, setToken] = useState<ProxyToken | null>(null)
  const [servers, setServers] = useState<ProxyServerInfo[]>([])

  async function signIn(url: string) {
    if (loading) return
    const base = normalizeProxyBase(url)
    if (!base) { setError("Enter a valid proxy URL."); return }
    setError(null)
    setLoading(true)
    try {
      const t = await signInToProxy(base)
      const list = await fetchProxyServers(base, t.accessToken)
      setOrigin(base)
      setToken(t)
      setServers(list)
      setStep("select")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.")
    } finally {
      setLoading(false)
    }
  }

  function select(info: ProxyServerInfo) {
    if (!token) return
    addProxiedServerEntry({ baseOrigin: origin, serverId: info.serverId, token, name: info.name })
    onConnected()
  }

  return { step, loading, error, token, servers, signIn, select, clearError: () => setError(null) }
}
