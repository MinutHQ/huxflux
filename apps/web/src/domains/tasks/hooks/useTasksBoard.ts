// State + drag-drop wiring for the kanban board.
//
// Owns:
//  - the tasks query and the active-sprint filter,
//  - the live ws subscription that invalidates the cache on task events,
//  - the drag start/end handlers that optimistically update local + server
//    state and (when the task has a jiraKey) push the transition to Jira,
//  - the "intercept drag to in-progress" flow which surfaces the start-work
//    picker instead of silently moving an un-agented task.

import { useCallback, useMemo, useState } from "react"
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import { useTaskDrag } from "./useTaskDrag"

export function useTasksBoard() {
  const queryClient = useQueryClient()
  const { data: tasks = [], isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.tasks.list(),
    queryFn: () => api.tasks.list(),
    on: {
      "task:comment": (_e, h) => h.invalidate(),
      "task:updated": (_e, h) => h.invalidate(),
    },
  })

  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeSprintOnly, setActiveSprintOnly] = useState(false)
  const [pendingStartWorkTask, setPendingStartWorkTask] = useState<TaskItem | null>(null)

  // Filter tasks: active sprint = tasks where sprint state is "active"
  const filteredTasks = useMemo(() => {
    if (!activeSprintOnly) return tasks
    function matches(item: TaskItem): boolean {
      if (item.sprintState === "active") return true
      return item.subtasks.some(matches)
    }
    return tasks.filter(matches)
  }, [tasks, activeSprintOnly])

  const hasSprintData = tasks.some((t) => t.sprintName)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const setTasks = useCallback(
    (updater: (prev: TaskItem[]) => TaskItem[]) => {
      queryClient.setQueryData<TaskItem[]>(queryKeys.tasks.list(), (prev) => updater(prev ?? []))
    },
    [queryClient],
  )

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }, [])

  const handleDragEnd = useTaskDrag({
    tasks,
    setActiveId,
    setTasks,
    setPendingStartWorkTask,
  })

  const activeTask = activeId ? (tasks.find((t) => t.id === activeId) ?? null) : null

  return {
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
  }
}
