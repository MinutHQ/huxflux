import { api, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import { cn } from "@huxflux/ui"

const MODELS = [
  { id: "Opus 4.7", label: "Claude Opus 4.7", api: "claude-opus-4-7", context: "200K" },
  { id: "Sonnet 4.6", label: "Claude Sonnet 4.6", api: "claude-sonnet-4-6", context: "200K" },
  { id: "Opus 4.6", label: "Claude Opus 4.6", api: "claude-opus-4-6", context: "200K" },
  { id: "Haiku 4.5", label: "Claude Haiku 4.5", api: "claude-haiku-4-5-20251001", context: "200K" },
]

export function ModelsSettings() {
  const { data: settings } = useHuxfluxQuery({ queryKey: queryKeys.settings.current(), queryFn: api.settings.current })
  const defaultModel = settings?.defaultModel ?? "Sonnet 4.6"

  const setDefaultModel = useHuxfluxMutation<unknown, string>({
    mutationFn: (modelId) => api.settings.update({ defaultModel: modelId }),
    invalidate: () => queryKeys.settings.current(),
  })

  function handleSetDefault(modelId: string) {
    setDefaultModel.mutate(modelId)
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground mb-4">
        The default model used for new agents. Can be overridden per agent.
      </p>
      {MODELS.map((model) => (
        <button
          key={model.id}
          onClick={() => handleSetDefault(model.id)}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors text-left",
            defaultModel === model.id
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-card text-foreground hover:bg-accent/50"
          )}
        >
          <div>
            <div className="text-sm font-medium">{model.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{model.api} · {model.context} context</div>
          </div>
          {defaultModel === model.id && (
            <span className="text-[11px] font-medium text-primary">Default</span>
          )}
        </button>
      ))}
    </div>
  )
}
