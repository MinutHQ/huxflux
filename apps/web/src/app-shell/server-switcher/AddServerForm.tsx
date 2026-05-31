import { useState } from "react"
import { useServers } from "@/hooks/useServers"
import { setActiveServerId } from "@huxflux/shared"
import { IconLoader2, IconAlertCircle } from "@tabler/icons-react"
import { validateAuth } from "./validateAuth"

/**
 * Inline form rendered at the bottom of the server dropdown for adding a new
 * server. On success, sets the new server active and reloads the window so
 * all hooks re-bootstrap against the new server.
 */
export function AddServerForm({ onDone }: { onDone: () => void }) {
  const { add } = useServers()
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
      const result = await validateAuth(normalizedUrl, trimmedToken)
      if (result === "unreachable") { setError("Could not reach server. Check the URL."); return }
      if (result === "unauthorized") { setError("Invalid auth token."); return }

      const server = add({ name: name.trim() || "My Server", url: normalizedUrl, token: trimmedToken })
      setActiveServerId(server.id)
      window.location.reload()
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Connection timed out.")
      } else {
        setError("Could not reach server.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-border space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Add server
      </div>
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
      <input
        type="password"
        value={token}
        onChange={(e) => { setToken(e.target.value); setError(null) }}
        placeholder="Auth token"
        className="w-full text-[12px] font-mono bg-background border border-input rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
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
          disabled={!url.trim() || !token.trim() || loading}
          className="text-[12px] bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading && <IconLoader2 size={11} className="animate-spin" />}
          {loading ? "Verifying…" : "Connect"}
        </button>
      </div>
    </form>
  )
}
