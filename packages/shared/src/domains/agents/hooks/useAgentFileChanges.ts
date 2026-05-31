import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent, AgentsServerEvent } from "../agents.types.js"

type FileChangedEvent = Extract<AgentsServerEvent, { type: "file:changed" }>

/**
 * Replaces the agent's `fileChanges` array when the server emits a
 * `file:changed` frame. The server sends the full updated list so we just
 * overwrite, no patching.
 */
export function useAgentFileChanges(id: string | null) {
  const queryClient = useQueryClient()

  const handleEvent = useCallback(
    (event: FileChangedEvent) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(id), (old) => {
        if (!old) return old
        return { ...old, fileChanges: event.files }
      })
    },
    [id, queryClient]
  )

  return { handleEvent }
}
