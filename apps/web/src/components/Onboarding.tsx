import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useServers } from "@/hooks/useServers"
import { setActiveServerId } from "@/lib/serverStore"
import { IconServer, IconLoader2, IconAlertCircle } from "@tabler/icons-react"

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { add } = useServers()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || loading) return
    setError(null)
    setLoading(true)

    const normalizedUrl = url.trim().replace(/\/$/, "")

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      let ok = false
      try {
        const res = await fetch(`${normalizedUrl}/health`, { signal: controller.signal })
        ok = res.ok
      } finally {
        clearTimeout(timer)
      }

      if (!ok) {
        setError("Server responded but /health returned an error. Check the URL and try again.")
        return
      }

      const server = add({
        name: name.trim() || "My Server",
        url: normalizedUrl,
      })

      setActiveServerId(server.id)

      onComplete()
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Connection timed out. Make sure the server is running and reachable.")
      } else {
        setError("Could not reach the server. Check the URL and make sure it is running.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <IconServer size={22} className="text-primary" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Connect to your Hive server
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Enter the URL of your Hive server. It can be running on localhost or accessible via Tailscale.
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Machine"
              className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Server URL
            </label>
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null) }}
              placeholder="http://localhost:3001"
              className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20">
              <IconAlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <span className="text-[12px] text-red-400 leading-snug">{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full mt-1"
            disabled={!url.trim() || loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <IconLoader2 size={14} className="animate-spin" />
                Connecting…
              </span>
            ) : (
              "Connect"
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
