import { useState } from "react"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { Button, cn } from "@huxflux/ui"
import { IconBrandGithub, IconLoader2, IconRefresh } from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { SettingsStatusDot } from "../components/SettingsStatusDot"

export function GitHubSettings() {
  const queryClient = useQueryClient()
  const [testing, setTesting] = useState(false)

  const { data: status, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.settings.githubStatus(),
    queryFn: () => api.settings.githubStatus(),
    staleTime: 60_000,
  })

  async function testConnection() {
    setTesting(true)
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.githubStatus() })
    setTesting(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground/50 text-sm">
        <IconLoader2 size={16} className="animate-spin" /> Checking GitHub connection...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">Connection</div>
        <div className="text-[12px] text-muted-foreground leading-relaxed">
          GitHub access is configured via the <code className="text-foreground/70 bg-card px-1 py-0.5 rounded text-[11px]">GITHUB_TOKEN</code> environment
          variable on the server. PR reviews, file diffs, and CI checks require a valid token with <code className="text-foreground/70 bg-card px-1 py-0.5 rounded text-[11px]">repo</code> scope.
        </div>
      </div>

      {status && (
        <div className={cn(
          "rounded-lg border p-4 space-y-3",
          status.connected ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5",
        )}>
          <div className="flex items-center gap-3">
            <SettingsStatusDot status={status.connected ? "online" : "offline"} />
            <span className="text-sm font-medium text-foreground">
              {status.connected ? "Connected" : "Not connected"}
            </span>
          </div>

          {status.connected && status.login && (
            <div className="flex items-center gap-3 pl-5">
              {status.avatarUrl ? (
                <img src={status.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <IconBrandGithub size={20} className="text-muted-foreground" />
              )}
              <div>
                <div className="text-sm text-foreground font-medium">{status.login}</div>
                {status.name && <div className="text-xs text-muted-foreground">{status.name}</div>}
              </div>
            </div>
          )}

          {status.connected && status.scopes.length > 0 && (
            <div className="pl-5 space-y-1">
              <div className="text-xs text-muted-foreground">Token scopes</div>
              <div className="flex flex-wrap gap-1">
                {status.scopes.map((scope) => (
                  <span key={scope} className="text-[11px] px-1.5 py-0.5 rounded bg-card border border-border text-foreground/70">
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          )}

          {status.connected && status.rateLimitRemaining != null && status.rateLimitTotal != null && (
            <div className="pl-5">
              <div className="text-xs text-muted-foreground">
                Rate limit: {status.rateLimitRemaining} / {status.rateLimitTotal} remaining
              </div>
            </div>
          )}

          {status.error && (
            <div className="pl-5 text-xs text-red-400">{status.error}</div>
          )}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
        {testing ? <IconLoader2 size={13} className="animate-spin" /> : <IconRefresh size={13} />}
        {testing ? "Testing..." : "Test connection"}
      </Button>
    </div>
  )
}
