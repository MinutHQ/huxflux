// Pure action helpers used by the full-view: subtask creation and
// refine-agent reply. Each call refreshes the tasks query cache (and
// invalidates the agent query when needed) so the rest of the app sees
// the fresh state immediately.
//
// Note: the start-work flow is owned by TasksView (it surfaces a picker
// to pick the repo before spawning the agent), so it does not live here.

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys } from "@huxflux/shared"

export function useTaskActions() {
  const queryClient = useQueryClient()

  const handleAddSubtask = useCallback(
    async (parentId: string, title: string) => {
      // fire-and-forget; intentional: bespoke setQueryData with returned task list, not standard invalidation
      // eslint-disable-next-line no-restricted-syntax
      const result = await api.tasks.create({ title, parentId })
      queryClient.setQueryData(queryKeys.tasks.list(), result)
    },
    [queryClient],
  )

  const handleReply = useCallback(
    async (taskId: string, content: string): Promise<string | null> => {
      // fire-and-forget; intentional: returns multiple values (tasks + agentId) used to seed cache and chain navigation
      // eslint-disable-next-line no-restricted-syntax
      const result = await api.tasks.replyToAgent(taskId, content)
      queryClient.setQueryData(queryKeys.tasks.list(), result.tasks)
      if (result.agentId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(result.agentId) })
      }
      return result.agentId ?? null
    },
    [queryClient],
  )

  return { handleAddSubtask, handleReply }
}
