import { useCallback, useState } from "react"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import { cn, Dialog, DialogContent } from "@huxflux/ui"
import { IconLoader2 } from "@tabler/icons-react"
import { useAppContext } from "@/hooks/useAppContext"
import { isTauri } from "@/lib/platform"
import { COLUMNS } from "../config"
import { useTasksBoard } from "../hooks/useTasksBoard"
import { AskAiBubble } from "./board/AskAiBubble"
import { BoardTopBar } from "./board/BoardTopBar"
import { KanbanColumn } from "./board/KanbanColumn"
import { NewTaskInput } from "./board/NewTaskInput"
import {
  StartWorkPopover,
  type StartWorkOpts,
} from "./board/StartWorkPopover"
import { TaskCard } from "./board/TaskCard"
import { TaskDetailSheet } from "./full-view/TaskDetailSheet"

/**
 * Top-level tasks surface: the kanban board, an optional right-side sheet
 * for the focused task, the "Ask AI" floating bubble, and the dialogs for
 * new-task and start-work. Heavy lifting lives in `useTasksBoard` and the
 * detail sheet's own hook.
 */
export function TasksView({ initialTaskId }: { initialTaskId?: string } = {}) {
  const { sidebarCollapsed } = useAppContext()
  const queryClient = useQueryClient()
  const {
    tasks,
    filteredTasks,
    hasSprintData,
    isLoading,
    activeSprintOnly,
    setActiveSprintOnly,
    sensors,
    activeTask,
    handleDragStart,
    handleDragEnd,
    setTasks,
    pendingStartWorkTask,
    setPendingStartWorkTask,
  } = useTasksBoard()

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId ?? null)
  const [addingTask, setAddingTask] = useState(false)

  const selectedTask = selectedTaskId
    ? (tasks.find((t) => t.id === selectedTaskId) ?? null)
    : null

  const handleStartWorkConfirm = useCallback(
    async (task: TaskItem, opts: StartWorkOpts) => {
      try {
        // Persist the chosen repo onto the task first, since start-work derives
        // the repo from the task row server-side.
        if (opts.repoId && opts.repoId !== task.repoId) {
          // fire-and-forget; intentional: sequential prerequisite for the next call, not an independent mutation
          // eslint-disable-next-line no-restricted-syntax
          await api.tasks.update(task.id, { repoId: opts.repoId })
        }
        // fire-and-forget; intentional: returns task list + chains agent cache invalidation, bespoke flow
        // eslint-disable-next-line no-restricted-syntax
        const result = await api.tasks.startWork(task.id)
        queryClient.setQueryData(queryKeys.tasks.list(), result.tasks)
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
        const { toast } = await import("sonner")
        toast.success("Agent started", { description: task.title })
      } catch (err) {
        const { toast } = await import("sonner")
        toast.error((err as Error).message || "Failed to start work")
      } finally {
        setPendingStartWorkTask(null)
      }
    },
    [queryClient, setPendingStartWorkTask],
  )

  return (
    <div className="relative flex flex-col h-full w-full">
      {/* Header aligned with the agent workspace header so traffic-light
          spacing matches across views. */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-1.5 shrink-0",
          isTauri && "min-h-12",
          sidebarCollapsed && isTauri && "pl-32",
        )}
      >
        <h1 className="text-[13px] font-medium text-foreground">Tasks</h1>
        <span className="text-[11px] text-muted-foreground/40">
          {filteredTasks.length}
        </span>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-1 pt-0">
          <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-card border border-border/40 overflow-hidden">
            <BoardTopBar
              hasSprintData={hasSprintData}
              activeSprintOnly={activeSprintOnly}
              onSetActiveSprint={setActiveSprintOnly}
              onNewTask={() => setAddingTask(true)}
            />

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <IconLoader2 size={20} className="text-muted-foreground/40 animate-spin" />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
                <div className="flex gap-1.5 h-full min-w-min p-2">
                  {COLUMNS.map((col) => (
                    <KanbanColumn
                      key={col.id}
                      column={col}
                      tasks={filteredTasks.filter((t) => t.status === col.id)}
                      onTaskClick={(task) => setSelectedTaskId(task.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      <NewTaskInput open={addingTask} onClose={() => setAddingTask(false)} />

      <Dialog
        open={!!pendingStartWorkTask}
        onOpenChange={(next) => {
          if (!next) setPendingStartWorkTask(null)
        }}
      >
        <DialogContent className="max-w-[360px] p-0">
          {pendingStartWorkTask && (
            <StartWorkPopover
              task={pendingStartWorkTask}
              onStart={(opts) => handleStartWorkConfirm(pendingStartWorkTask, opts)}
              onClose={() => setPendingStartWorkTask(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {!selectedTask && <AskAiBubble />}

      {selectedTask && (
        <TaskDetailSheet
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={(updated) => {
            setTasks((p) => p.map((t) => (t.id === updated.id ? updated : t)))
          }}
          onRequestStartWork={(t) => setPendingStartWorkTask(t)}
        />
      )}
    </div>
  )
}
