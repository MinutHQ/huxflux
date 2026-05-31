import { ScrollArea } from "@huxflux/ui"
import { IconPlayerPlay } from "@tabler/icons-react"
import type { TaskItem } from "@huxflux/shared"
import { TaskAgentLinks, TaskAgentDetails } from "./TaskAgentLinks"
import { TaskDescription } from "./TaskDescription"
import { TaskProperties } from "./TaskProperties"
import { TaskTitle } from "./TaskTitle"
import { SubtasksList } from "./SubtasksList"
import { AddSubtaskInput } from "./AddSubtaskInput"

export function TaskContentPanel({
  item,
  onUpdate,
  onAddSubtask,
  onSelectSubtask,
  onStartWork,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
  onAddSubtask: (parentId: string, title: string) => void
  onSelectSubtask: (s: TaskItem) => void
  onStartWork?: () => void
}) {
  const canStartWork = item.agents.length === 0 && !!onStartWork

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="px-5 py-4 space-y-4 max-w-2xl">
            <TaskTitle item={item} onUpdate={onUpdate} />
            <TaskProperties item={item} onUpdate={onUpdate} />
            <TaskAgentLinks item={item} />

            {canStartWork && (
              <button
                onClick={onStartWork}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/40 hover:bg-accent/30 transition-colors text-[12px] font-medium text-foreground"
              >
                <IconPlayerPlay size={13} className="text-emerald-400" />
                Start work
              </button>
            )}

            <TaskDescription item={item} onUpdate={onUpdate} />

            <div className="space-y-1">
              <SubtasksList subtasks={item.subtasks} onSelect={onSelectSubtask} />
              <AddSubtaskInput parentId={item.id} onAdd={onAddSubtask} />
            </div>

            <TaskAgentDetails item={item} />
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
