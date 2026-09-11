import { api, queryKeys, useHuxfluxQuery, type BackgroundState } from "@huxflux/shared"

const emptyState: BackgroundState = { tasks: [], lingering: false }

/**
 * Background work the CLI is running for this agent (Monitor watches,
 * background Bash) and whether the CLI outlived its final result. Loaded once
 * per agent, then kept current from the `background:state` WS event.
 */
export function useBackgroundState(agentId: string): BackgroundState {
  const { data } = useHuxfluxQuery({
    queryKey: queryKeys.agents.background(agentId),
    queryFn: () => api.agents.backgroundState(agentId),
    staleTime: 30_000,
    on: {
      "background:state": (event, h) => {
        if (event.agentId === agentId) h.setData(event.state)
      },
    },
  })
  return data ?? emptyState
}
