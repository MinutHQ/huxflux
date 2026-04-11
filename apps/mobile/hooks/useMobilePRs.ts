import { useQuery } from "@tanstack/react-query"
import { api, useServerConfig, type OpenPRWithRepo } from "@huxflux/shared"
import { useMemo } from "react"

export interface MobilePR {
  id: string
  repoId: string
  repoName: string
  number: number
  title: string
  author: string
  authorAvatar?: string
  branch: string
  baseBranch: string
  body?: string
  additions: number
  deletions: number
  createdAt: string
  requestedAt: string
  hasChangeRequests: boolean
  draft: boolean
  url: string
  reviewRequested?: boolean
  userReviewed?: boolean
  isReadyToMerge?: boolean
  agentId?: string
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function mapPR(pr: OpenPRWithRepo): MobilePR {
  return {
    id: `${pr.repoId}-${pr.number}`,
    repoId: pr.repoId,
    repoName: pr.repoName,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    authorAvatar: pr.authorAvatar,
    branch: pr.branch,
    baseBranch: pr.baseBranch,
    body: pr.body,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    createdAt: pr.createdAt,
    requestedAt: relativeTime(pr.createdAt),
    hasChangeRequests: pr.hasChangeRequests,
    draft: pr.draft,
    url: pr.url,
    reviewRequested: pr.reviewRequested,
    userReviewed: pr.userReviewed,
    isReadyToMerge: pr.isReadyToMerge,
    agentId: pr.agentId,
  }
}

export interface PRSections {
  toReview: MobilePR[]
  reRequested: MobilePR[]
  reviewed: MobilePR[]
}

export function useMobilePRs() {
  const { githubEnabled } = useServerConfig()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["prs"],
    queryFn: () => api.listPRs(),
    enabled: githubEnabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  })

  const prs = useMemo(() => (data ?? []).map(mapPR), [data])

  const sections = useMemo<PRSections>(() => {
    const toReview: MobilePR[] = []
    const reRequested: MobilePR[] = []
    const reviewed: MobilePR[] = []

    for (const pr of prs) {
      if (pr.userReviewed && pr.reviewRequested) {
        reRequested.push(pr)
      } else if (pr.userReviewed) {
        reviewed.push(pr)
      } else {
        toReview.push(pr)
      }
    }

    return { toReview, reRequested, reviewed }
  }, [prs])

  return { prs, sections, isLoading, refetch, githubEnabled }
}
