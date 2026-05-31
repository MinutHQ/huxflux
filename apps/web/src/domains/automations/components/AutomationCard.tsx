import { cn } from "@huxflux/ui"
import type { Automation, AutomationStatus } from "@huxflux/shared"
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconClock,
  IconCheck,
  IconCircleX,
  IconBolt,
} from "@tabler/icons-react"
import { timeAgo } from "../utils"

const STATUS_CONFIG: Record<AutomationStatus, { label: string; dotClass: string }> = {
  draft: { label: "Draft", dotClass: "bg-muted-foreground/40" },
  active: { label: "Active", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", dotClass: "bg-amber-400" },
  error: { label: "Error", dotClass: "bg-red-500" },
}

interface AutomationCardProps {
  automation: Automation
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
}

export function AutomationCard({ automation, onSelect, onToggle, onDelete }: AutomationCardProps) {
  const status = STATUS_CONFIG[automation.status] ?? STATUS_CONFIG.draft
  const lastRun = automation.lastRunAt ? timeAgo(automation.lastRunAt) : null

  return (
    <div
      onClick={onSelect}
      className={cn(
        "bg-accent/40 border rounded-xl p-4 cursor-pointer hover:bg-accent/60 transition-all group",
        automation.status === "active"
          ? "border-emerald-500/40 hover:border-emerald-500/60"
          : "border-border/40 hover:border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0 mt-0.5">
          <IconBolt size={16} className="text-muted-foreground/60" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-medium text-foreground truncate">{automation.name}</h3>
          {automation.description && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">{automation.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
            title={automation.status === "active" ? "Pause" : "Start"}
          >
            {automation.status === "active" ? <IconPlayerPause size={13} /> : <IconPlayerPlay size={13} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-accent transition-colors"
            title="Delete"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground/50">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", status.dotClass)} />
          <span>{status.label}</span>
        </div>
        {automation.schedule && (
          <div className="flex items-center gap-1">
            <IconClock size={10} />
            <span>{automation.schedule}</span>
          </div>
        )}
        {lastRun && <span>Last run: {lastRun}</span>}
        {automation.runCount > 0 && <span>{automation.runCount} runs</span>}
        {automation.lastRunStatus === "failure" && <IconCircleX size={10} className="text-red-400" />}
        {automation.lastRunStatus === "success" && <IconCheck size={10} className="text-emerald-400" />}
      </div>
    </div>
  )
}
