import { useDraggable } from "@dnd-kit/core"
import { cn } from "@huxflux/ui"
import {
  IconChecklist,
  IconGitPullRequest,
} from "@tabler/icons-react"
import type { TaskItem } from "@huxflux/shared"
import { PriorityIcon } from "../PriorityIcon"

function TaskCardMeta({ task }: { task: TaskItem }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      {task.jiraKey && (
        <span className="text-[10px] font-mono font-medium text-muted-foreground/60">
          {task.jiraKey}
        </span>
      )}
      {task.sprintName && (
        <span className="text-[9px] text-muted-foreground/40 truncate max-w-[100px]">
          {task.sprintName}
        </span>
      )}
      {task.priority && (
        <span className="ml-auto">
          <PriorityIcon priority={task.priority} size={11} />
        </span>
      )}
    </div>
  )
}

function TaskCardFooter({ task }: { task: TaskItem }) {
  const lead = task.agents[0]
  const hasActiveAgent = task.agents.some((a) => a.agentStatus === "in-progress")
  return (
    <div className="flex items-center gap-2 mt-2">
      {task.subtasks.length > 0 && (
        <div className="flex items-center gap-1">
          <IconChecklist size={11} className="text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/60">
            {task.subtasks.filter((s) => s.status === "done").length}/{task.subtasks.length}
          </span>
        </div>
      )}
      {lead?.prNumber && (
        <div className="flex items-center gap-1">
          <IconGitPullRequest
            size={11}
            className={cn(
              lead.prMerged
                ? "text-purple-400"
                : lead.prDraft
                  ? "text-muted-foreground/50"
                  : "text-green-400",
            )}
          />
          <span className="text-[10px] text-muted-foreground/60">#{lead.prNumber}</span>
        </div>
      )}
      {hasActiveAgent && (
        <div className="flex items-center gap-1 ml-auto">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[9px] text-muted-foreground/50">Working</span>
        </div>
      )}
    </div>
  )
}

export function TaskCard({
  task,
  onClick,
  isDragOverlay,
}: {
  task: TaskItem
  onClick?: () => void
  isDragOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: task,
  })

  const hasActiveAgent = task.agents.some((a) => a.agentStatus === "in-progress")

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      onClick={onClick}
      className={cn(
        "relative bg-accent/40 border border-border/40 rounded-xl px-3 py-2.5 cursor-pointer hover:border-border hover:bg-accent/60 transition-all group overflow-hidden",
        isDragging && "opacity-30",
        isDragOverlay && "shadow-2xl ring-1 ring-foreground/10 rotate-1",
        hasActiveAgent && "border-l-2 border-l-amber-400",
      )}
    >
      <TaskCardMeta task={task} />
      <p className="text-[12px] font-medium text-foreground leading-snug line-clamp-2">
        {task.title}
      </p>
      <TaskCardFooter task={task} />
    </div>
  )
}
