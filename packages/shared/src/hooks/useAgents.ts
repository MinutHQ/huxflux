import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../api"
import { useAgentEvents } from "../ws"
import type { AgentSummary } from "../types"

export function useAgents() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["agents"],
    queryFn: api.getAgents,
    staleTime: 5_000,
  })

  useAgentEvents(null, (event) => {
    if (event.type === "agent:updated") {
      queryClient.setQueryData<AgentSummary[]>(["agents"], (old) => {
        if (!old) return old
        const updated = event.agent
        if (updated.parentAgentId) return old // child tabs don't appear in sidebar
        const idx = old.findIndex((a) => a.id === updated.id)
        if (idx === -1) return [...old, updated]
        return old.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
      })
    }
  })

  return query
}
