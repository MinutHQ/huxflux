import { useState, useMemo } from "react"
import { api, queryKeys, useHuxfluxQuery, useHuxfluxMutation, type ProviderInfo, type SharedProviderModel } from "@huxflux/shared"
import { cn } from "@huxflux/ui"
import { IconSearch } from "@tabler/icons-react"

const SUB_PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google", mistral: "Mistral",
  deepseek: "DeepSeek", cerebras: "Cerebras", groq: "Groq", cohere: "Cohere",
  xai: "xAI", "fireworks-ai": "Fireworks AI", togetherai: "Together AI",
  perplexity: "Perplexity", meta: "Meta", "amazon-bedrock": "Amazon Bedrock",
  azure: "Azure", nebius: "Nebius",
}

function subProviderOf(modelApi: string): string | null {
  const slash = modelApi.indexOf("/")
  return slash > 0 ? modelApi.slice(0, slash) : null
}

function groupBySubProvider(models: SharedProviderModel[]): Array<{ sub: string | null; label: string | null; models: SharedProviderModel[] }> {
  const groups = new Map<string | null, SharedProviderModel[]>()
  for (const m of models) {
    const sub = subProviderOf(m.api)
    const list = groups.get(sub) ?? []
    list.push(m)
    groups.set(sub, list)
  }
  return [...groups.entries()].map(([sub, subModels]) => ({
    sub,
    label: sub ? (SUB_PROVIDER_LABELS[sub] ?? sub) : null,
    models: subModels,
  }))
}

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

  const [search, setSearch] = useState("")

  const filteredProviders = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return providers
    return providers
      .map((p) => ({
        ...p,
        models: p.models.filter((m) => m.label.toLowerCase().includes(q) || m.api.toLowerCase().includes(q)),
      }))
      .filter((p) => p.models.length > 0)
  }, [providers, search])

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
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
            <IconSearch size={13} className="text-muted-foreground/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          {filteredProviders.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/50 text-center py-4">No models found</p>
          ) : filteredProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isDefaultProvider={provider.id === defaultProvider}
              defaultModel={defaultModel}
              onSelectModel={(model) =>
                updateSettings.mutate({ provider: provider.id, model })
              }
            />
          ))}
        </>
      )}
    </div>
  )
}

function ModelRow({ model, isSelected, disabled, onSelect }: {
  model: SharedProviderModel
  isSelected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors",
        "border-b border-border last:border-b-0",
        !disabled
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
}

function ProviderCard({ provider, isDefaultProvider, defaultModel, onSelectModel }: {
  provider: ProviderInfo
  isDefaultProvider: boolean
  defaultModel: string
  onSelectModel: (model: string) => void
}) {
  const hasSubProviders = provider.models.some((m) => subProviderOf(m.api) !== null)
  const subGroups = hasSubProviders ? groupBySubProvider(provider.models) : null

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
          {subGroups ? subGroups.map((group) => (
            <div key={group.sub ?? "root"}>
              {group.label && (
                <div className="px-4 pt-2.5 pb-1 border-b border-border bg-accent/30">
                  <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              )}
              {group.models.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  isSelected={isDefaultProvider && model.label === defaultModel}
                  disabled={!provider.available}
                  onSelect={() => onSelectModel(model.label)}
                />
              ))}
            </div>
          )) : provider.models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              isSelected={isDefaultProvider && model.label === defaultModel}
              disabled={!provider.available}
              onSelect={() => onSelectModel(model.label)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
