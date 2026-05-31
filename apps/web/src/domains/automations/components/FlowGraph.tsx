import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconSchema, IconArrowRight, IconChevronDown } from "@tabler/icons-react"
import type { AutomationStep } from "@huxflux/shared"
import { NODE_CONFIG } from "../constants"

export function FlowGraph({ steps = [] }: { steps?: AutomationStep[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!steps || steps.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
          <IconSchema size={22} className="text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-foreground">No flow defined yet</p>
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[280px]">
            Use the chat to describe what you want to automate. The AI will build the flow for you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="flex flex-col items-center gap-1">
        {steps.map((step, i) => (
          <FlowGraphNode
            key={step.id}
            step={step}
            isFirst={i === 0}
            isExpanded={expandedId === step.id}
            onToggle={() => setExpandedId(expandedId === step.id ? null : step.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface FlowGraphNodeProps {
  step: AutomationStep
  isFirst: boolean
  isExpanded: boolean
  onToggle: () => void
}

function FlowGraphNode({ step, isFirst, isExpanded, onToggle }: FlowGraphNodeProps) {
  const config = NODE_CONFIG[step.type] ?? NODE_CONFIG.custom!
  const Icon = config.icon
  const configEntries = Object.entries(step.config ?? {}).filter(([k, v]) => v && k !== "triggerType")

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      {!isFirst && (
        <div className="flex flex-col items-center py-1">
          <div className="w-px h-4 bg-border/50" />
          <IconArrowRight size={10} className="text-muted-foreground/30 rotate-90" />
          <div className="w-px h-4 bg-border/50" />
        </div>
      )}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
          isExpanded ? "border-primary/30 bg-primary/5" : "border-border/40 bg-accent/30 hover:bg-accent/50"
        )}
      >
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", config.bg)}>
          <Icon size={16} className={config.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-foreground">{step.label}</p>
          <p className="text-[10px] text-muted-foreground/50 capitalize">{step.type}</p>
        </div>
        {configEntries.length > 0 && (
          <IconChevronDown size={12} className={cn("text-muted-foreground/30 transition-transform shrink-0", isExpanded && "rotate-180")} />
        )}
      </button>

      {isExpanded && configEntries.length > 0 && (
        <div className="w-full mt-1 rounded-lg border border-border/30 bg-accent/20 px-3 py-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {configEntries.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2 text-[10px]">
              <span className="text-muted-foreground/50 w-16 shrink-0 capitalize">{key}</span>
              <span className="text-foreground/80 font-mono break-all">{String(value)}</span>
            </div>
          ))}
          {step.connections.length > 0 && (
            <div className="flex items-start gap-2 text-[10px] pt-1 border-t border-border/20">
              <span className="text-muted-foreground/50 w-16 shrink-0">Next</span>
              <span className="text-muted-foreground/60 font-mono">{step.connections.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
