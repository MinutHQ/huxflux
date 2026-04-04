import { useQuery } from "@tanstack/react-query"
import { api } from "../api"
import { getActiveServer } from "../serverStore"

export function useRepos() {
  const serverUrl = getActiveServer()?.url ?? null

  return useQuery({
    queryKey: ["repos", serverUrl],
    queryFn: api.getRepos,
    staleTime: 30_000,
    enabled: !!serverUrl,
  })
}
