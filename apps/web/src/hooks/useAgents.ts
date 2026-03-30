import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAgentEvents } from "@/lib/ws"
import type { AgentSummary } from "@/data/mock"

export function useAgents() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["agents"],
    queryFn: api.getAgents,
    staleTime: 5_000,
  })

  // Update agent in list when server emits agent:updated
  useAgentEvents(null, (event) => {
    if (event.type === "agent:updated") {
      queryClient.setQueryData<AgentSummary[]>(["agents"], (old) => {
        if (!old) return old
        const updated = event.agent as AgentSummary
        const idx = old.findIndex((a) => a.id === updated.id)
        if (idx === -1) return [...old, updated]
        return old.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
      })
    }
  })

  return query
}
