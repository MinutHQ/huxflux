import { useQuery } from "@tanstack/react-query"
import { api } from "../api"

export function useRepos() {
  return useQuery({
    queryKey: ["repos"],
    queryFn: api.getRepos,
    staleTime: 30_000,
  })
}
