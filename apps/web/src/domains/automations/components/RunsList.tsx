import { ScrollArea } from "@huxflux/ui"
import { IconCheck, IconCircleX, IconLoader2 } from "@tabler/icons-react"
import type { AutomationRun } from "@huxflux/shared"
import { timeAgo } from "../utils"

export function RunsList({ runs = [] }: { runs?: AutomationRun[] }) {
  if (!runs || runs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
        <p className="text-[12px] text-muted-foreground/50">No runs yet</p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-1">
        {runs.map((run) => (
          <div key={run.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors">
            {run.status === "success" ? (
              <IconCheck size={13} className="text-emerald-400 shrink-0" />
            ) : run.status === "failure" ? (
              <IconCircleX size={13} className="text-red-400 shrink-0" />
            ) : (
              <IconLoader2 size={13} className="text-amber-400 animate-spin shrink-0" />
            )}
            <span className="text-[11px] text-muted-foreground/60 shrink-0 w-16">{timeAgo(run.startedAt)}</span>
            {run.finishedAt && run.startedAt && (
              <span className="text-[10px] text-muted-foreground/30 shrink-0">
                {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
              </span>
            )}
            <div className="flex-1 min-w-0">
              {run.error && <span className="text-[10px] text-red-400/70 truncate block">{run.error}</span>}
              {run.output && !run.error && <span className="text-[10px] text-muted-foreground/40 truncate block">{run.output.slice(0, 100)}</span>}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
