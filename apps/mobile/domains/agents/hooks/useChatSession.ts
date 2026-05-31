import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, type Agent, type AgentSummary, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import { useModal } from "@/ui"

/**
 * Owns the active session id, the child-session list, and child-session creation
 * for the agent chat surface. Splits out of `useAgentChat` to keep that hook
 * under the function-size cap.
 *
 * `createSession` takes the current agent as an argument (rather than the hook
 * taking it as a param) so we can call `useAgent` AFTER this hook without
 * needing to invoke this hook twice.
 */
export function useChatSession(rootId: string) {
  const queryClient = useQueryClient()
  const modal = useModal()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(rootId)
  useEffect(() => { setActiveSessionId(rootId) }, [rootId])

  const { data: sessions = [], refetch: refetchSessions } = useHuxfluxQuery<AgentSummary[]>({
    queryKey: queryKeys.agents.sessions(rootId),
    queryFn: () => api.agents.sessions(rootId),
    enabled: !!rootId,
    staleTime: 30_000,
  })

  const createSessionMutation = useHuxfluxMutation<AgentSummary, Agent>({
    mutationFn: (currentAgent) => api.agents.create({
      title: "Untitled",
      branch: currentAgent.branch,
      model: currentAgent.model,
      shareWorktreeWith: rootId,
    }),
    invalidate: () => queryKeys.agents.sessions(rootId),
    onSuccess: (created) => {
      // `api.agents.create` returns the new agent without the heavy
      // collections (the server's POST handler echoes back the raw DB row).
      // Seed empty arrays so the cached entry conforms to the full `Agent`
      // shape before the next refetch fills them in.
      queryClient.setQueryData(queryKeys.agents.detail(created.id), {
        ...created,
        messages: [],
        fileChanges: [],
        terminalOutput: [],
      })
      setActiveSessionId(created.id)
      refetchSessions()
    },
    onError: () => {
      modal.showAlert("Error", "Failed to create session")
    },
  })

  function createSession(currentAgent: Agent) {
    if (createSessionMutation.isPending) return
    createSessionMutation.mutate(currentAgent)
  }

  return { activeSessionId, setActiveSessionId, sessions, creatingSession: createSessionMutation.isPending, createSession }
}
