import { cn } from "@huxflux/ui"
import type { TaskItem } from "@huxflux/shared"
import { COLUMNS } from "../../config"

function agentDotClass(status: TaskItem["agents"][number]["agentStatus"]) {
  return status === "done"
    ? "bg-emerald-500"
    : status === "in-review"
      ? "bg-blue-400"
      : status === "draft-pr"
        ? "bg-violet-400"
        : status === "in-progress"
          ? "bg-amber-400"
          : "bg-muted-foreground/40"
}

export function SubtasksList({
  subtasks,
  onSelect,
}: {
  subtasks: TaskItem[]
  onSelect: (subtask: TaskItem) => void
}) {
  const doneCount = subtasks.filter((s) => s.status === "done").length

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Subtasks
        </h3>
        {subtasks.length > 0 && (
          <>
            <span className="text-[10px] text-muted-foreground/40">
              {doneCount}/{subtasks.length}
            </span>
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${(doneCount / subtasks.length) * 100}%` }}
              />
            </div>
          </>
        )}
      </div>
      {subtasks.length > 0 && (
        <div className="space-y-0.5">
          {subtasks.map((subtask) => {
            const col = COLUMNS.find((c) => c.id === subtask.status)
            return (
              <button
                key={subtask.id}
                onClick={() => onSelect(subtask)}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    col?.dotClass ?? "bg-muted-foreground/40",
                  )}
                />
                <span
                  className={cn(
                    "text-xs flex-1 min-w-0 truncate",
                    subtask.status === "done"
                      ? "text-muted-foreground/40 line-through"
                      : "text-foreground",
                  )}
                >
                  {subtask.title}
                </span>
                {subtask.agents.length > 0 && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {subtask.agents.map((a) => (
                      <div
                        key={a.agentId}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          agentDotClass(a.agentStatus),
                        )}
                      />
                    ))}
                  </div>
                )}
                {subtask.jiraKey && (
                  <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0">
                    {subtask.jiraKey}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
