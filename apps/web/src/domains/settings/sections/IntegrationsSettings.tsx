import { useEffect, useState } from "react"
import { api, useHuxfluxMutation } from "@huxflux/shared"
import { cn } from "@huxflux/ui"
import { IconLoader2 } from "@tabler/icons-react"

export function IntegrationsSettings() {
  const [jiraBaseUrl, setJiraBaseUrl] = useState("")
  const [jiraEmail, setJiraEmail] = useState("")
  const [jiraApiToken, setJiraApiToken] = useState("")
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<{ ok: boolean; method?: string; displayName?: string; error?: string } | null>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.settings.current().then((s: any) => {
      setJiraBaseUrl(s.jiraBaseUrl ?? "")
      setJiraEmail(s.jiraEmail ?? "")
      setJiraApiToken(s.jiraApiToken ?? "")
      setLoading(false)
    })
  }, [])

  const saveMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.settings.update({ jiraBaseUrl: jiraBaseUrl || undefined, jiraEmail: jiraEmail || undefined, jiraApiToken: jiraApiToken || undefined }),
  })
  const testMut = useHuxfluxMutation<{ ok: boolean; method?: string; displayName?: string }, void>({
    mutationFn: () => api.tasks.jiraStatus(),
    onSuccess: (result) => setTestResult(result),
    onError: (err) => setTestResult({ ok: false, error: err instanceof Error ? err.message : "Connection failed" }),
  })
  const saving = saveMut.isPending
  const testing = testMut.isPending

  const save = () => saveMut.mutate()
  const test = () => { setTestResult(null); testMut.mutate() }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground/50 text-sm">
        <IconLoader2 size={16} className="animate-spin" /> Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">Jira</div>
        <div className="text-[12px] text-muted-foreground leading-relaxed">
          Connect to Jira Cloud to sync tasks. Create an API token at{" "}
          <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
            id.atlassian.com
          </a>.
          If not configured, falls back to acli (Atlassian CLI).
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Instance URL</label>
          <input
            value={jiraBaseUrl}
            onChange={(e) => setJiraBaseUrl(e.target.value)}
            placeholder="https://mycompany.atlassian.net"
            className="w-full bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Email</label>
          <input
            value={jiraEmail}
            onChange={(e) => setJiraEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">API Token</label>
          <input
            type="password"
            value={jiraApiToken}
            onChange={(e) => setJiraApiToken(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={test} disabled={testing} className="text-xs font-medium px-3 py-1.5 rounded-md bg-card border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50">
          {testing ? "Testing..." : "Test connection"}
        </button>
      </div>

      {testResult && (
        <div className={cn(
          "text-xs px-3 py-2 rounded-md border",
          testResult.ok
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-red-500/10 border-red-500/30 text-red-400"
        )}>
          {testResult.ok ? (
            <>Connected{testResult.method === "api" ? ` as ${testResult.displayName}` : " via acli"}</>
          ) : (
            <>{testResult.error}</>
          )}
        </div>
      )}
    </div>
  )
}
