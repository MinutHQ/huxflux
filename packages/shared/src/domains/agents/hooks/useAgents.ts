import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../../../api.js"
import { queryKeys } from "../../../queryKeys.js"
import { useAgentEvents } from "../../../ws.js"
import { getActiveServer } from "../../servers/servers.store.js"
import type { AgentSummary } from "../agents.types.js"

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
    queryKey: queryKeys.agents.list(serverUrl),
    queryFn: api.agents.list,
    staleTime: 5_000,
    enabled: !!serverUrl,
    select: (data) => data.filter((a) => !a.taskId), // hide refine agents from sidebar
  })

  useAgentEvents(null, (event) => {
    if (event.type === "agent:updated") {
      const updated = {
        ...event.agent,
        // The broadcast sends raw DB rows where prStatus is a JSON string — parse it
        prStatus: typeof event.agent.prStatus === "string" ? (() => { try { return JSON.parse(event.agent.prStatus) } catch { return undefined } })() : event.agent.prStatus,
      }
      if (deletedAgentIds.has(updated.id)) return
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) => {
        if (!old) return old
        if (updated.parentAgentId) return old // child tabs don't appear in sidebar
        const idx = old.findIndex((a) => a.id === updated.id)
        if (idx === -1) return [...old, updated]
        return old.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
      })
    }
    if (event.type === "message:done" && !event.segment) {
      const agentId = (event as { agentId?: string }).agentId
      if (agentId) {
        // The turn is over, so any question it was blocked on is gone too
        // (the server clears its store on finalize without an ask:resolved).
        queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
          old ? old.map((a) => a.id === agentId ? { ...a, streaming: false, pendingQuestion: null } : a) : old
        )
      }
    }
    // Sidebar "needs input" marker. Both events are broadcast, so this list
    // hears them for every agent, not only the open one.
    if (event.type === "ask:question") {
      const { agentId, toolUseId, questions } = event
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === agentId ? { ...a, pendingQuestion: { toolUseId, questions } } : a) : old
      )
    }
    if (event.type === "ask:resolved") {
      const { agentId } = event
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === agentId ? { ...a, pendingQuestion: null } : a) : old
      )
    }
    if (event.type === "agent:deleted") {
      markAgentDeleted(event.agentId)
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.filter((a) => a.id !== event.agentId) : old
      )
    }
    if (event.type === "ws:reconnected") {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
    }
  })

  return query
}
