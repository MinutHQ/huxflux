// Drag-end handler for the kanban board.
//
// Splits out from `useTasksBoard` to stay under the 80-line function cap.
// Owns:
//  - The "drag to in-progress without an agent" intercept that opens the
//    start-work picker instead of silently transitioning the card.
//  - The optimistic local update + server persistence.
//  - The Jira transition push when the task is Jira-backed.

import { useCallback } from "react"
import type { DragEndEvent } from "@dnd-kit/core"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import { COLUMN_TO_JIRA, COLUMNS } from "../config"
import type { TaskColumn } from "../tasks.types"

export function useTaskDrag({
  tasks,
  setActiveId,
  setTasks,
  setPendingStartWorkTask,
}: {
  tasks: TaskItem[]
  setActiveId: (id: string | null) => void
  setTasks: (updater: (prev: TaskItem[]) => TaskItem[]) => void
  setPendingStartWorkTask: (task: TaskItem | null) => void
}) {
  const queryClient = useQueryClient()
  return useCallback(
    (e: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = e
      if (!over) return
      const taskId = active.id as string
      const newStatus = over.id as TaskColumn
      if (!COLUMNS.some((c) => c.id === newStatus)) return

      const task = tasks.find((t) => t.id === taskId)

      // Intercept drag to "in-progress": if the task has no agent yet, open
      // the start-work picker rather than silently transitioning. The picker
      // is responsible for kicking off the agent + persisting the move.
      if (newStatus === "in-progress" && task && task.agents.length === 0) {
        setPendingStartWorkTask(task)
        return
      }

      // Optimistic local update + server persistence
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      )
      api.tasks.update(taskId, { status: newStatus }).then((updated) => {
        queryClient.setQueryData(queryKeys.tasks.list(), updated)
      })

      // Push to Jira if the task is Jira-backed
      if (task?.jiraKey) {
        const jiraStatus = COLUMN_TO_JIRA[newStatus]
        if (jiraStatus) api.tasks.transition(taskId, jiraStatus)
      }
    },
    [tasks, setActiveId, setTasks, setPendingStartWorkTask, queryClient],
  )
}
