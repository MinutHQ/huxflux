import { api, queryKeys, useHuxfluxQuery, type TaskListState } from "@huxflux/shared"

const emptyState: TaskListState = { tasks: [] }

/**
 * Claude's TaskCreate / TaskUpdate task list for this agent. Loaded once from
 * the CLI's on-disk store, then kept current from the `tasks:state` WS event
 * the runner emits after each TaskCreate / TaskUpdate result.
 */
export function useTaskList(agentId: string): TaskListState {
  const { data } = useHuxfluxQuery({
    queryKey: queryKeys.agents.taskList(agentId),
    queryFn: () => api.agents.taskList(agentId),
    staleTime: 30_000,
    on: {
      "tasks:state": (event, h) => {
        if (event.agentId === agentId) h.setData(event.state)
      },
    },
  })
  return data ?? emptyState
}
