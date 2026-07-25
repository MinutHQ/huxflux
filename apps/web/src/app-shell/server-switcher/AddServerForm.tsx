import { useState } from "react"
import { useServers } from "@/hooks/useServers"
import { setActiveServerId } from "@huxflux/shared"
import { IconLoader2, IconAlertCircle } from "@tabler/icons-react"
import { validateAuth } from "./validateAuth"
import { isProxyConnectString, connectProxiedServer } from "@/lib/proxyConnect"
import { AddProxyServer } from "./AddProxyServer"

/**
 * Inline form rendered at the bottom of the server dropdown for adding a new
 * server. Two modes: a direct LAN server (URL + token), or a server reached
 * through the public proxy (sign in, then pick from the user's servers). On
 * success, sets the new server active and reloads so hooks re-bootstrap.
 */
export function AddServerForm({ onDone }: { onDone: () => void }) {
  const { add } = useServers()
  const [mode, setMode] = useState<"direct" | "proxy">("direct")
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || loading) return
    setError(null)
    setLoading(true)

    const normalizedUrl = url.trim().replace(/\/$/, "")
    const trimmedToken = token.trim()
    try {
      // A pasted full proxy connect string (…/s/<serverId>) signs in via the
      // browser instead of taking a token.
      if (isProxyConnectString(normalizedUrl)) {
        await connectProxiedServer(normalizedUrl, { name })
        window.location.reload()
        return
      }

      const result = await validateAuth(normalizedUrl, trimmedToken)
      if (result === "unreachable") { setError("Could not reach server. Check the URL."); return }
      if (result === "unauthorized") { setError("Invalid auth token."); return }

      const server = add({ name: name.trim() || "My Server", url: normalizedUrl, token: trimmedToken })
      setActiveServerId(server.id)
      window.location.reload()
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Connection timed out.")
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Could not reach server.")
      }
    } finally {
      setLoading(false)
    }
  }

  const proxyMode = isProxyConnectString(url.trim())
  const tabClass = (active: boolean) =>
    `pb-0.5 transition-colors ${active ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground"}`

  return (
    <div className="p-3 border-t border-border space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Add server
      </div>
      <div className="flex gap-3 text-[11px]">
        <button type="button" onClick={() => setMode("direct")} className={tabClass(mode === "direct")}>Direct</button>
        <button type="button" onClick={() => setMode("proxy")} className={tabClass(mode === "proxy")}>Via proxy</button>
      </div>

      {mode === "proxy" ? (
        <AddProxyServer onDone={onDone} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Machine"
            className="w-full text-[12px] bg-background border border-input rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null) }}
            placeholder="http://localhost:4321"
            className="w-full text-[12px] font-mono bg-background border border-input rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
          {!proxyMode && (
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setError(null) }}
              placeholder="Auth token"
              className="w-full text-[12px] font-mono bg-background border border-input rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
            />
          )}
          {proxyMode && (
            <div className="text-[11px] text-muted-foreground">
              This is a proxy address. You'll sign in with your account in the browser.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-400">
              <IconAlertCircle size={11} />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onDone}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim() || (!proxyMode && !token.trim()) || loading}
              className="text-[12px] bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading && <IconLoader2 size={11} className="animate-spin" />}
              {loading ? (proxyMode ? "Signing in…" : "Verifying…") : (proxyMode ? "Sign in" : "Connect")}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
