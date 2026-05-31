import { useState } from "react"
import { cn } from "@huxflux/ui"
import { ScrollArea } from "@huxflux/ui"
import type { Automation } from "@huxflux/shared"

interface SettingsPanelProps {
  // Caller is expected to pass `key={automation.id}` so this component
  // remounts (and re-initializes the local form state) when the user
  // switches between automations.
  automation: Automation
  onUpdate: (updates: Partial<{ name: string; description: string; schedule: string }>) => void
}

export function SettingsPanel({ automation, onUpdate }: SettingsPanelProps) {
  const [name, setName] = useState(automation.name)
  const [desc, setDesc] = useState(automation.description ?? "")
  const [model, setModel] = useState("Sonnet 4.6")
  const [provider, setProvider] = useState("claude")

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== automation.name) onUpdate({ name: name.trim() }) }}
            className="w-full bg-accent/30 border border-border/40 rounded-lg px-3 py-2 text-[12px] text-foreground outline-none focus:border-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Description</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => { if (desc !== (automation.description ?? "")) onUpdate({ description: desc }) }}
            rows={3}
            className="w-full bg-accent/30 border border-border/40 rounded-lg px-3 py-2 text-[12px] text-foreground outline-none focus:border-ring resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">AI Model</label>
          <div className="flex gap-2">
            {["Sonnet 4.6", "Opus 4.6", "Haiku 4.5"].map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors",
                  model === m ? "bg-primary/15 text-foreground border-primary/30" : "bg-accent/30 text-muted-foreground/60 border-border/40 hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Provider</label>
          <div className="flex gap-2">
            {["claude", "claude-interactive"].map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors capitalize",
                  provider === p ? "bg-primary/15 text-foreground border-primary/30" : "bg-accent/30 text-muted-foreground/60 border-border/40 hover:text-foreground"
                )}
              >
                {p === "claude-interactive" ? "Claude (Interactive)" : "Claude"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Created</label>
          <p className="text-[12px] text-muted-foreground">{new Date(automation.createdAt).toLocaleString()}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Total runs</label>
          <p className="text-[12px] text-muted-foreground">{automation.runCount}</p>
        </div>
      </div>
    </ScrollArea>
  )
}
