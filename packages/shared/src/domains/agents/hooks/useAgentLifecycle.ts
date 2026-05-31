import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent, AgentsServerEvent } from "../agents.types.js"
import { reportAgentError } from "./errorHandler.js"

type LifecycleEvent =
  | Extract<AgentsServerEvent, { type: "agent:updated" }>
  | { type: "error"; agentId?: string; message: string }
  | { type: "ws:reconnected" }

/**
 * Per-agent lifecycle events:
 *   - `agent:updated`: merge summary changes into the detail cache. Guarded
 *     by an id match because the underlying `useAgentEvents` filter doesn't
 *     catch this frame (no top-level `agentId` field), so without the guard
 *     a newly-created agent B could overwrite agent A's cache entry.
 *   - `ws:reconnected`: invalidate the detail query so we resync after a
 *     dropped connection.
 *   - `error`: surface through the platform-injected handler.
 */
export function useAgentLifecycle(id: string | null) {
  const queryClient = useQueryClient()

  const handleEvent = useCallback(
    (event: LifecycleEvent) => {
      if (event.type === "agent:updated") {
        if (event.agent.id !== id) return
        // Server emits `prStatus` as either a parsed object (in-process) or a
        // raw JSON string (DB row over WS). Parse-if-string keeps both paths
        // shaped as PRStatus on the cache entry.
        const parsed = {
          ...event.agent,
          prStatus: typeof event.agent.prStatus === "string"
            ? (() => { try { return JSON.parse(event.agent.prStatus) } catch { return undefined } })()
            : event.agent.prStatus,
        }
        queryClient.setQueryData<Agent>(queryKeys.agents.detail(id), (old) => {
          if (!old) return old
          return { ...old, ...parsed }
        })
        return
      }
      if (event.type === "ws:reconnected") {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(id) })
        return
      }
      if (event.type === "error") {
        reportAgentError(event.message)
      }
    },
    [id, queryClient]
  )

  return { handleEvent }
}
