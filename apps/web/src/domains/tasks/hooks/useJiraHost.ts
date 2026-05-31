// Resolve the Jira host the workspace is connected to so task cards and
// the full task view can deep-link into Jira.
//
// Falls back to "jira.atlassian.net" when settings haven't loaded or no
// Jira instance is configured — that fallback only renders a broken link,
// not a crash.

import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"

export function useJiraHost(): string {
  const { data } = useHuxfluxQuery({
    queryKey: queryKeys.settings.current(),
    queryFn: () => api.settings.current() as Promise<{ jiraBaseUrl?: string }>,
    staleTime: 60_000,
  })
  if (data?.jiraBaseUrl) {
    return data.jiraBaseUrl.replace(/\/+$/, "").replace(/^https?:\/\//, "")
  }
  return "jira.atlassian.net"
}
