import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { api } from "../../../api.js"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent } from "../agents.types.js"
import { mergeSubAgentData, type SubAgentDataMap } from "./subAgentData.js"

/**
 * Pure TanStack Query fetch for a single agent, plus the persistent
 * client-side `subAgentDataRef` map used to re-merge sub-agent data on every
 * read (the server doesn't persist sub-call data, so a refetch / reconnect
 * would otherwise drop it).
 *
 * Returned `subAgentDataRef` is shared with `useAgentMessageStream` so both
 * paths update/read the same map.
 */
export function useAgentQuery(id: string | null) {
  // Persistent client-side sub-agent data, keyed by Agent tool call ID. Lives
  // in a ref so it survives React Query cache invalidations / refetches.
  const subAgentDataRef = useRef<SubAgentDataMap>(new Map())

  // Reset sub-agent cache on agent switch.
  useEffect(() => {
    subAgentDataRef.current = new Map()
  }, [id])

  const query = useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => api.agents.get(id!),
    enabled: !!id,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
    // Always re-merge client-side subCalls after any server fetch
    select: (data): Agent => {
      const map = subAgentDataRef.current
      if (map.size === 0) return data
      return { ...data, messages: mergeSubAgentData(data.messages, map) }
    },
  })

  return { query, subAgentDataRef }
}
