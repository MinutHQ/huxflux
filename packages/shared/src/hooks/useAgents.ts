import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../api"
import { getActiveServer } from "../serverStore"
import { useAgentEvents } from "../ws"
import type { AgentSummary } from "../types"

export function useAgents() {
  const queryClient = useQueryClient()
  const serverUrl = getActiveServer()?.url ?? null

  const query = useQuery({
    queryKey: ["agents", serverUrl],
    queryFn: api.getAgents,
    staleTime: 5_000,
    enabled: !!serverUrl,
  })

  useAgentEvents(null, (event) => {
    if (event.type === "agent:updated") {
      queryClient.setQueryData<AgentSummary[]>(["agents", serverUrl], (old) => {
        if (!old) return old
        const updated = event.agent
        if (updated.parentAgentId) return old // child tabs don't appear in sidebar
        const idx = old.findIndex((a) => a.id === updated.id)
        if (idx === -1) return [...old, updated]
        return old.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
      })
    }
    if (event.type === "agent:deleted") {
      queryClient.setQueryData<AgentSummary[]>(["agents", serverUrl], (old) =>
        old ? old.filter((a) => a.id !== event.agentId) : old
      )
    }
  })

  return query
}
