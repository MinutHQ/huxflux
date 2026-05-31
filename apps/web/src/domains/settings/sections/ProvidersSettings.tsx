import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { cn } from "@huxflux/ui"

const PROVIDER_META: Record<string, { description: string; installHint: string }> = {
  claude: { description: "Anthropic's Claude Code CLI", installHint: "Run claude /login in your terminal to sign in." },
  codex: { description: "OpenAI's Codex CLI", installHint: "Install with npm install -g @openai/codex and set OPENAI_API_KEY." },
  opencode: { description: "Multi-provider OpenCode CLI", installHint: "Install from opencode.ai and configure your provider keys." },
}

export function ProvidersSettings() {
  const { data: providers = [], isLoading, isError } = useHuxfluxQuery({
    queryKey: queryKeys.settings.providers(),
    queryFn: api.settings.providers,
    staleTime: 30_000,
  })

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground mb-4">
        CLI tools that Huxflux can use to run agents. Install a CLI to enable it.
      </p>
      {providers.map((p) => {
        const meta = PROVIDER_META[p.id] ?? { description: p.name, installHint: "" }
        return (
          <div key={p.id} className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{p.name}</span>
              <span className={cn(
                "text-[11px] px-2 py-0.5 rounded-full border",
                p.available
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-secondary text-muted-foreground border-border"
              )}>
                {p.available ? "Installed" : "Not installed"}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-snug mb-2">{meta.description}</p>
            {!p.available && (
              <p className="text-[11px] text-muted-foreground/60 leading-snug">{meta.installHint}</p>
            )}
            {p.available && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {p.capabilities.planMode && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">Plan mode</span>}
                {p.capabilities.toolUseEvents && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">Tool use</span>}
                {p.capabilities.thinkingBlocks && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">Thinking</span>}
                {p.capabilities.sessionResume && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">Sessions</span>}
                {p.capabilities.subAgentSupport && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">Sub-agents</span>}
              </div>
            )}
          </div>
        )
      })}
      {providers.length === 0 && (
        <div className="p-4 rounded-lg border border-border bg-card">
          <p className="text-[12px] text-muted-foreground">
            {isLoading ? "Loading providers..." : isError ? "Failed to load providers. Make sure the server is updated." : "No providers found."}
          </p>
        </div>
      )}
    </div>
  )
}
