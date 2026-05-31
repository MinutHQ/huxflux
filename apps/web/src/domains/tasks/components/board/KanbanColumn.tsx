import { useDroppable } from "@dnd-kit/core"
import { cn, ScrollArea } from "@huxflux/ui"
import type { TaskItem } from "@huxflux/shared"
import type { ColumnDef } from "../../config"
import { TaskCard } from "./TaskCard"

export function KanbanColumn({
  column,
  tasks,
  onTaskClick,
}: {
  column: ColumnDef
  tasks: TaskItem[]
  onTaskClick: (task: TaskItem) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] shrink-0">
      <div className="flex items-center gap-2 px-2.5 py-1.5 mb-0.5">
        <div className={cn("w-2 h-2 rounded-full", column.dotClass)} />
        <span className="text-[12px] font-medium text-foreground">{column.label}</span>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-0 rounded-xl p-1 transition-colors",
          isOver && "bg-accent/30 ring-1 ring-accent",
        )}
      >
        <ScrollArea className="h-full">
          <div className="space-y-1 pr-0.5">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
