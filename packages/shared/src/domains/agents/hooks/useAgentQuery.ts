import { useQuery } from "@tanstack/react-query"
import { api } from "../../../api.js"
import { queryKeys } from "../../../queryKeys.js"

/** Pure TanStack Query fetch for a single agent. */
export function useAgentQuery(id: string | null) {
  const query = useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => api.agents.get(id!),
    enabled: !!id,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  })

  return { query }
}
