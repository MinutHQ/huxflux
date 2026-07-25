import { useState } from "react"
import { Button } from "@huxflux/ui"
import { IconServer, IconLoader2, IconAlertCircle } from "@tabler/icons-react"
import { useProxyConnect } from "@/hooks/useProxyConnect"

/**
 * First-run proxy connect: enter the proxy URL, sign in via the browser, then
 * pick one of your servers by name. Onboarding-styled sibling of AddProxyServer;
 * both share the flow logic in useProxyConnect.
 */
export function OnboardingProxyConnect({ onComplete }: { onComplete: () => void }) {
  const [url, setUrl] = useState("")
  const { step, loading, error, token, servers, signIn, select, clearError } = useProxyConnect(onComplete)

  if (step === "select") {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
          Signed in{token?.email ? ` as ${token.email}` : ""}. Choose a server to connect to:
        </p>
        {servers.length === 0 ? (
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted/40 border border-border">
            <IconAlertCircle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-[12px] text-muted-foreground leading-snug">
              No servers are currently connected to this proxy for your account. Start a Huxflux server pointed at the proxy, then reload.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((s) => (
              <button
                key={s.serverId}
                type="button"
                onClick={() => select(s)}
                className="w-full flex items-center gap-2.5 text-sm text-foreground bg-background border border-input rounded-md px-3 py-2.5 hover:border-ring transition-colors text-left"
              >
                <IconServer size={16} className="text-muted-foreground shrink-0" />
                <span className="truncate">{s.name}</span>
                {s.version && <span className="text-[11px] text-muted-foreground ml-auto shrink-0">v{s.version}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void signIn(url) }} className="space-y-3">
      <div>
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Proxy URL
        </label>
        <input
          autoFocus
          value={url}
          onChange={(e) => { setUrl(e.target.value); clearError() }}
          placeholder="https://proxy.example.com"
          className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20">
          <IconAlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <span className="text-[12px] text-red-400 leading-snug">{error}</span>
        </div>
      )}

      <Button type="submit" className="w-full mt-1" disabled={!url.trim() || loading}>
        {loading ? (
          <span className="flex items-center gap-2">
            <IconLoader2 size={14} className="animate-spin" />
            Signing in…
          </span>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  )
}
