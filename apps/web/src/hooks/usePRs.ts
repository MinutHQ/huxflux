import { useQuery } from "@tanstack/react-query"
import { api, useServerConfig } from "@huxflux/shared"
import type { PullRequest } from "@/data/mockReviews"

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function usePRs() {
  const { githubEnabled } = useServerConfig()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["prs"],
    queryFn: () => api.listPRs(),
    enabled: githubEnabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  })

  const prs: PullRequest[] = (data ?? []).map((pr) => ({
    id: `${pr.repoId}-${pr.number}`,
    repoId: pr.repoId,
    number: pr.number,
    title: pr.title,
    repo: pr.repoName,
    author: pr.author,
    authorAvatar: pr.authorAvatar,
    branch: pr.branch,
    baseBranch: pr.baseBranch,
    requestedAt: relativeTime(pr.createdAt),
    reviewStatus: pr.hasChangeRequests ? "changes-requested" : "awaiting",
    reviewRequested: pr.reviewRequested,
    userReviewed: pr.userReviewed,
    isReadyToMerge: pr.isReadyToMerge,
    unread: false,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    files: [],
    description: pr.body ?? "",
    url: pr.url,
    agentId: pr.agentId,
  }))

  return { prs, isLoading, refetch }
}
