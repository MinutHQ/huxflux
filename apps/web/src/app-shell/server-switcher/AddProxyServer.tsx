import { useState } from "react"
import { fetchProxyServers, type ProxyServerInfo, type ProxyToken } from "@huxflux/shared"
import { IconLoader2, IconAlertCircle, IconServer } from "@tabler/icons-react"
import { normalizeProxyBase, signInToProxy, addProxiedServerEntry } from "@/lib/proxyConnect"

type Step = "url" | "select"

/**
 * Proxy add-flow: the user enters only the proxy base URL, signs in with their
 * account in the browser, then picks one of the servers currently registered
 * for them on that proxy.
 */
export function AddProxyServer({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("url")
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const [token, setToken] = useState<ProxyToken | null>(null)
  const [servers, setServers] = useState<ProxyServerInfo[]>([])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
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

  function handleSelect(serverId: string) {
    if (!token) return
    addProxiedServerEntry({ baseOrigin: origin, serverId, token })
    window.location.reload()
  }

  if (step === "select") {
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground">
          Signed in{token?.email ? ` as ${token.email}` : ""}. Choose a server:
        </div>
        {servers.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">
            No servers are currently connected to this proxy for your account.
          </div>
        ) : (
          <div className="space-y-1">
            {servers.map((s) => (
              <button
                key={s.serverId}
                type="button"
                onClick={() => handleSelect(s.serverId)}
                className="w-full flex items-center gap-2 text-[12px] text-foreground bg-background border border-input rounded px-2 py-1.5 hover:border-ring transition-colors text-left"
              >
                <IconServer size={13} className="text-muted-foreground shrink-0" />
                <span className="font-mono truncate">{s.serverId}</span>
                {s.version && <span className="text-[10px] text-muted-foreground ml-auto shrink-0">v{s.version}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className="text-[12px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-2">
      <input
        autoFocus
        type="text"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(null) }}
        placeholder="https://proxy.example.com"
        className="w-full text-[12px] font-mono bg-background border border-input rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
      <div className="text-[11px] text-muted-foreground">
        You'll sign in with your account in the browser, then pick a server.
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-400">
          <IconAlertCircle size={11} />
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="text-[12px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!url.trim() || loading}
          className="text-[12px] bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading && <IconLoader2 size={11} className="animate-spin" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  )
}
