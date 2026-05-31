// Stack-based navigation + update helpers for the full-screen task view.
//
// `stackIds` is the breadcrumb trail of nested task ids (root first, current
// last). Update / add-subtask / reply operations all keep the server cache
// in sync via the supplied queryClient.

import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import { applyNestedUpdate, findItem } from "../utils"
import { useTaskActions } from "./useTaskActions"

/**
 * Stack-based navigation + update helpers for the full-screen task view.
 *
 * Consumers MUST mount this with `key={task.id}` so a new root task
 * remounts the hook and resets the breadcrumb stack. We deliberately don't
 * mirror `task.id` into a `useEffect` here — that triggers a cascading
 * render and is flagged by `react-hooks/set-state-in-effect`.
 */
export function useTaskFullView({
  task,
  onUpdate,
}: {
  task: TaskItem
  onUpdate: (updated: TaskItem) => void
}) {
  const queryClient = useQueryClient()
  const [stackIds, setStackIds] = useState<string[]>([task.id])
  const currentId = stackIds[stackIds.length - 1] ?? task.id
  const current = findItem([task], currentId) ?? task

  const handleFieldUpdate = useCallback(
    async (updates: Partial<TaskItem>) => {
      const stack = stackIds.map((id) => findItem([task], id) ?? task)
      const last = stack[stack.length - 1] ?? task
      const updated = { ...last, ...updates }
      const newStack = [...stack.slice(0, -1), updated]
      const updatedRoot = applyNestedUpdate(newStack, updates)
      onUpdate(updatedRoot)
      // fire-and-forget; intentional: optimistic-first task update with full-list cache rewrite from server response
      // eslint-disable-next-line no-restricted-syntax
      const result = await api.tasks.update(current.id, {
        title: updates.title,
        description: updates.description,
        status: updates.status,
        priority: updates.priority,
        assignee: updates.assignee,
        repoId: updates.repoId,
      })
      queryClient.setQueryData(queryKeys.tasks.list(), result)
    },
    [current.id, stackIds, task, onUpdate, queryClient],
  )

  const { handleAddSubtask, handleReply } = useTaskActions()

  // Breadcrumb path (root → current)
  const breadcrumbs = stackIds
    .map((id) => findItem([task], id))
    .filter((t): t is TaskItem => !!t)

  const pushSubtask = useCallback((s: TaskItem) => {
    setStackIds((prev) => [...prev, s.id])
  }, [])

  const navigateToCrumb = useCallback((index: number) => {
    setStackIds((prev) => prev.slice(0, index + 1))
  }, [])

  return {
    current,
    breadcrumbs,
    handleFieldUpdate,
    handleAddSubtask,
    handleReply,
    pushSubtask,
    navigateToCrumb,
  }
}
