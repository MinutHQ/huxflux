import { api, queryKeys, useHuxfluxQuery, useHuxfluxMutation, type ProviderInfo } from "@huxflux/shared"
import { cn } from "@huxflux/ui"

export function ModelsSettings() {
  const { data: settings } = useHuxfluxQuery({
    queryKey: queryKeys.settings.current(),
    queryFn: api.settings.current,
  })
  const { data: providers = [], isLoading, isError } = useHuxfluxQuery({
    queryKey: queryKeys.settings.providers(),
    queryFn: api.settings.providers,
    staleTime: 30_000,
  })

  const defaultModel = settings?.defaultModel ?? "Sonnet 4.6"
  const defaultProvider = settings?.defaultProvider ?? "claude"

  const updateSettings = useHuxfluxMutation({
    mutationFn: (opts: { provider: string; model: string }) =>
      api.settings.update({ defaultProvider: opts.provider, defaultModel: opts.model }),
    invalidate: () => queryKeys.settings.current(),
  })

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        The default model used for new agents. Can be overridden per agent.
      </p>
      {isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading providers...</p>
      ) : isError || providers.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {isError ? "Failed to load providers. Make sure the server is running." : "No providers found."}
        </p>
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isDefaultProvider={provider.id === defaultProvider}
            defaultModel={defaultModel}
            onSelectModel={(model) =>
              updateSettings.mutate({ provider: provider.id, model })
            }
          />
        ))
      )}
    </div>
  )
}

function ProviderCard({
  provider,
  isDefaultProvider,
  defaultModel,
  onSelectModel,
}: {
  provider: ProviderInfo
  isDefaultProvider: boolean
  defaultModel: string
  onSelectModel: (model: string) => void
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-foreground">{provider.name}</span>
        <span
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full border",
            provider.available
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : "bg-secondary text-muted-foreground border-border",
          )}
        >
          {provider.available ? "Installed" : "Not installed"}
        </span>
      </div>
      {provider.models.length > 0 && (
        <div className="border-t border-border">
          {provider.models.map((model) => {
            const isSelected = isDefaultProvider && model.label === defaultModel
            return (
              <button
                key={model.id}
                disabled={!provider.available}
                onClick={() => onSelectModel(model.label)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors",
                  "border-b border-border last:border-b-0",
                  provider.available
                    ? isSelected
                      ? "bg-primary/5 text-foreground"
                      : "text-foreground hover:bg-accent/50"
                    : "text-muted-foreground/50 cursor-not-allowed",
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium">{model.label}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{model.api}</span>
                </div>
                {isSelected && <span className="text-[11px] font-medium text-primary">Default</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
