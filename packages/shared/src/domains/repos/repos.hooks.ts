import { useQuery } from "@tanstack/react-query"
import { api } from "../../api.js"
import { queryKeys } from "../../queryKeys.js"
import { getActiveServer } from "../servers/servers.store.js"

export function useRepos() {
  const serverUrl = getActiveServer()?.url ?? null

  return useQuery({
    queryKey: queryKeys.repos.list(serverUrl),
    queryFn: api.repos.list,
    staleTime: 30_000,
    enabled: !!serverUrl,
  })
}
