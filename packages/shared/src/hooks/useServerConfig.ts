import { useQuery } from "@tanstack/react-query"
import { api } from "../api"

export function useServerConfig() {
  const { data } = useQuery({
    queryKey: ["server-config"],
    queryFn: () => api.getServerConfig(),
    staleTime: 60_000,
  })
  return {
    githubEnabled: data?.githubEnabled ?? false,
    feedbackEnabled: data?.feedbackEnabled ?? false,
  }
}
