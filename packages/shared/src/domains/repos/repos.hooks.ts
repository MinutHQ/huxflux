import { useQuery } from "@tanstack/react-query"
import { api } from "../../api.js"
import { queryKeys } from "../../queryKeys.js"
import { useActiveServer } from "../servers/servers.hooks.js"

export function useRepos() {
  const serverUrl = useActiveServer()?.url ?? null

  return useQuery({
    queryKey: queryKeys.repos.list(serverUrl),
    queryFn: api.repos.list,
    staleTime: 30_000,
    enabled: !!serverUrl,
  })
}
