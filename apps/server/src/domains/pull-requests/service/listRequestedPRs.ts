import type { OpenPR } from "../../../types.js"
import { getOctokit } from "./octokit.js"

type Octokit = ReturnType<typeof getOctokit>
type SearchItem = Awaited<ReturnType<Octokit["search"]["issuesAndPullRequests"]>>["data"]["items"][number]

interface EnrichedPR {
  hasChangeRequests: boolean
  reviewRequested: boolean
  userReviewed: boolean
  branch: string
  baseBranch: string
  body: string | undefined
  additions: number
  deletions: number
}

async function enrichPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  me: { id: number; login: string },
  fromReviewed: boolean,
): Promise<EnrichedPR> {
  try {
    const [reviewsRes, prRes] = await Promise.all([
      octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 50 }),
      octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    ])
    const latestByReviewer = new Map<number, string>()
    for (const review of reviewsRes.data) {
      if (review.user && review.state !== "COMMENTED") {
        latestByReviewer.set(review.user.id, review.state)
      }
    }
    return {
      hasChangeRequests: [...latestByReviewer.values()].some((s) => s === "CHANGES_REQUESTED"),
      reviewRequested: prRes.data.requested_reviewers?.some((r) => r.login === me.login) ?? false,
      userReviewed: reviewsRes.data.some((r) => r.user?.id === me.id && r.state !== "DISMISSED"),
      branch: prRes.data.head.ref,
      baseBranch: prRes.data.base.ref,
      body: prRes.data.body ?? undefined,
      additions: prRes.data.additions,
      deletions: prRes.data.deletions,
    }
  } catch {
    return {
      hasChangeRequests: false,
      reviewRequested: false,
      userReviewed: fromReviewed,
      branch: "",
      baseBranch: "",
      body: undefined,
      additions: 0,
      deletions: 0,
    }
  }
}

function toResult(
  item: SearchItem,
  owner: string,
  repo: string,
  enriched: EnrichedPR,
): (OpenPR & { owner: string; repo: string }) | null {
  return {
    owner,
    repo,
    number: item.number,
    title: item.title,
    author: item.user?.login ?? "unknown",
    authorAvatar: item.user?.avatar_url,
    branch: enriched.branch,
    baseBranch: enriched.baseBranch,
    body: enriched.body,
    additions: enriched.additions,
    deletions: enriched.deletions,
    createdAt: item.created_at,
    hasChangeRequests: enriched.hasChangeRequests,
    reviewRequested: enriched.reviewRequested,
    userReviewed: enriched.userReviewed,
    // Octokit's search-result type doesn't expose `draft`, but PR items do
    // carry it at runtime, so read through a typed shim.
    draft: (item as unknown as { draft?: boolean }).draft ?? false,
    url: item.html_url,
  }
}

/**
 * List open PRs where the authenticated user is either a requested reviewer
 * OR has already submitted a review. Each entry is enriched with branch info,
 * additions/deletions, and the user-specific reviewRequested / userReviewed
 * flags so the UI can sort/filter without extra round-trips.
 */
export async function listReviewRequestedPRs(): Promise<Array<OpenPR & { owner: string; repo: string }>> {
  const octokit = getOctokit()

  // Fetch both: PRs where review is requested AND PRs already reviewed by me
  const [{ data: requestedData }, { data: reviewedData }, { data: me }] = await Promise.all([
    octokit.search.issuesAndPullRequests({ q: "is:pr is:open review-requested:@me", per_page: 50, sort: "created", order: "desc" }),
    octokit.search.issuesAndPullRequests({ q: "is:pr is:open reviewed-by:@me", per_page: 50, sort: "created", order: "desc" }),
    octokit.users.getAuthenticated(),
  ])

  // Deduplicate by PR URL — requested takes priority for the reviewRequested flag
  const byUrl = new Map<string, { item: SearchItem; fromReviewed: boolean }>()
  for (const item of requestedData.items) byUrl.set(item.html_url, { item, fromReviewed: false })
  for (const item of reviewedData.items) {
    if (!byUrl.has(item.html_url)) byUrl.set(item.html_url, { item, fromReviewed: true })
  }

  const results = await Promise.all(
    [...byUrl.values()].map(async ({ item, fromReviewed }) => {
      const match = item.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
      if (!match) return null
      const [, owner, repo] = match
      const enriched = await enrichPR(octokit, owner, repo, item.number, me, fromReviewed)
      return toResult(item, owner, repo, enriched)
    }),
  )

  return results.filter((r): r is NonNullable<typeof r> => r !== null)
}
