import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../api"
import { getActiveServer } from "../serverStore"
import { useAgentEvents } from "../ws"
import type { AgentSummary } from "../types"

// Tombstones for agents that were just deleted client-side. Prevents a
// late-arriving `agent:updated` event from resurrecting a deleted agent
// before the server's `agent:deleted` broadcast catches up.
const deletedAgentIds = new Set<string>()

export function markAgentDeleted(id: string) {
  deletedAgentIds.add(id)
  // Keep the tombstone long enough to outlast any in-flight events but
  // short enough not to block a legitimate re-create of the same id.
  setTimeout(() => deletedAgentIds.delete(id), 30_000)
}

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
      const updated = {
        ...event.agent,
        // The broadcast sends raw DB rows where prStatus is a JSON string — parse it
        prStatus: typeof event.agent.prStatus === "string" ? (() => { try { return JSON.parse(event.agent.prStatus) } catch { return undefined } })() : event.agent.prStatus,
      }
      if (deletedAgentIds.has(updated.id)) return
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) => {
        if (!old) return old
        if (updated.parentAgentId) return old // child tabs don't appear in sidebar
        const idx = old.findIndex((a) => a.id === updated.id)
        if (idx === -1) return [...old, updated]
        return old.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
      })
    }
    if (event.type === "agent:deleted") {
      markAgentDeleted(event.agentId)
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) =>
        old ? old.filter((a) => a.id !== event.agentId) : old
      )
    }
    if (event.type === "ws:reconnected") {
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    }
  })

  return query
}
