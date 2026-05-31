import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent, AgentsServerEvent } from "../agents.types.js"

type TerminalLineEvent = Extract<AgentsServerEvent, { type: "terminal:line" }>

/**
 * Appends each `terminal:line` frame to the agent's `terminalOutput` array.
 */
export function useAgentTerminal(id: string | null) {
  const queryClient = useQueryClient()

  const handleEvent = useCallback(
    (event: TerminalLineEvent) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(id), (old) => {
        if (!old) return old
        return { ...old, terminalOutput: [...old.terminalOutput, event.line] }
      })
    },
    [id, queryClient]
  )

  return { handleEvent }
}
