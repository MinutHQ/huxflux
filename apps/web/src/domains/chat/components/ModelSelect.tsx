import React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import { IconSparkles } from "@tabler/icons-react"

interface Model {
  id: string
  label: string
  provider: string
}

interface Provider {
  id: string
  name?: string
}

interface ModelSelectProps {
  currentValue: string
  currentLabel: string
  models: Model[]
  providers: Provider[]
  onChange: (value: string) => void
}

export function ModelSelect({ currentValue, currentLabel, models, providers, onChange }: ModelSelectProps) {
  const grouped = new Map<string, Model[]>()
  for (const m of models) {
    const list = grouped.get(m.provider) ?? []
    list.push(m)
    grouped.set(m.provider, list)
  }
  const entries = [...grouped.entries()]

  return (
    <Select value={currentValue} onValueChange={onChange}>
      <SelectTrigger className="h-auto border-0 shadow-none bg-transparent px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground gap-1.5 focus:ring-0 [&>svg]:hidden">
        <IconSparkles size={13} className="text-muted-foreground shrink-0" />
        <SelectValue>{currentLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {entries.map(([providerId, providerModels]) => (
          <React.Fragment key={providerId}>
            {entries.length > 1 && (
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                {providers.find((p) => p.id === providerId)?.name ?? providerId}
              </div>
            )}
            {providerModels.map((m) => (
              <SelectItem key={`${providerId}:${m.id}`} value={`${providerId}:${m.id}`}>{m.label}</SelectItem>
            ))}
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  )
}
