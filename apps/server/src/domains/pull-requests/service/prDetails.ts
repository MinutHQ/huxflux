import type { PRDetails, PRReview, PRCheck, PRThread, PRIssueComment } from "../../../types.js"
import { getOctokit, parseRepo } from "./octokit.js"

type GQLThreadsResult = {
  repository: { pullRequest: { reviewThreads: { nodes: Array<{
    id: string; isResolved: boolean; isOutdated: boolean
    path: string; line: number | null; originalLine: number | null
    comments: { nodes: Array<{
      id: string; databaseId: number
      author: { login: string; avatarUrl: string } | null
      body: string; createdAt: string; url: string
      replyTo: { id: string } | null
    }> }
  }> } } }
}

async function fetchReviewThreads(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GQLThreadsResult> {
  return octokit.graphql<GQLThreadsResult>(`
    query PRThreads($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id isResolved isOutdated path line originalLine
              comments(first: 50) {
                nodes {
                  id databaseId
                  author { login avatarUrl }
                  body createdAt url
                  replyTo { id }
                }
              }
            }
          }
        }
      }
    }
  `, { owner, repo, number: prNumber })
}

interface ReviewLike {
  user: { id: number; login: string; avatar_url: string } | null
  state: string
  submitted_at?: string | null
}

function buildReviews(
  reviewsData: ReviewLike[],
): { reviews: PRReview[]; hasChangeRequests: boolean; hasDismissedReviews: boolean } {
  const latestByReviewer = new Map<number, { state: string; login: string; avatar: string; submittedAt?: string }>()
  for (const review of reviewsData) {
    if (review.user && review.state !== "COMMENTED") {
      latestByReviewer.set(review.user.id, {
        state: review.state,
        login: review.user.login,
        avatar: review.user.avatar_url,
        submittedAt: review.submitted_at ?? undefined,
      })
    }
  }
  const hasChangeRequests = [...latestByReviewer.values()].some((r) => r.state === "CHANGES_REQUESTED")
  const hasDismissedReviews = [...latestByReviewer.values()].some((r) => r.state === "DISMISSED")
  const reviews: PRReview[] = [...latestByReviewer.values()].map((r) => ({
    author: r.login,
    avatarUrl: r.avatar,
    state: r.state as PRReview["state"],
    submittedAt: r.submittedAt,
  }))
  return { reviews, hasChangeRequests, hasDismissedReviews }
}

function buildThreads(threadsData: GQLThreadsResult): PRThread[] {
  return threadsData.repository.pullRequest.reviewThreads.nodes.map((t) => ({
    id: t.id,
    isResolved: t.isResolved,
    isOutdated: t.isOutdated,
    path: t.path,
    line: t.line ?? t.originalLine ?? undefined,
    comments: t.comments.nodes.map((c) => ({
      id: c.id,
      databaseId: c.databaseId,
      author: c.author?.login ?? "unknown",
      avatarUrl: c.author?.avatarUrl,
      body: c.body,
      createdAt: c.createdAt,
      url: c.url,
      isReply: c.replyTo !== null,
      path: t.path,
      line: t.line ?? t.originalLine ?? undefined,
    })),
  }))
}

/** Full PR details: status fields + reviews, checks, threads, issue comments, current user. */
export async function getPRDetails(repoUrl: string, prNumber: number): Promise<PRDetails> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  const [prRes, reviewsRes, checksRes, issueCommentsRes, threadsData, meRes] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.checks.listForRef({ owner, repo, ref: `refs/pull/${prNumber}/head`, per_page: 100 })
      .catch(() => ({ data: { check_runs: [] } })),
    octokit.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 100 }),
    fetchReviewThreads(octokit, owner, repo, prNumber)
      .catch(() => ({ repository: { pullRequest: { reviewThreads: { nodes: [] } } } } as GQLThreadsResult)),
    octokit.users.getAuthenticated().catch(() => ({ data: { login: undefined } })),
  ])

  const pr = prRes.data
  const { reviews, hasChangeRequests, hasDismissedReviews } = buildReviews(reviewsRes.data)

  const checks: PRCheck[] = checksRes.data.check_runs.map((c) => ({
    name: c.name,
    status: c.status as PRCheck["status"],
    conclusion: (c.conclusion ?? null) as PRCheck["conclusion"],
    url: c.html_url ?? undefined,
  }))

  const threads = buildThreads(threadsData)

  const issueComments: PRIssueComment[] = issueCommentsRes.data.map((c) => ({
    id: c.id,
    author: c.user?.login ?? "unknown",
    avatarUrl: c.user?.avatar_url ?? undefined,
    body: c.body ?? "",
    createdAt: c.created_at,
    url: c.html_url ?? "",
  }))

  return {
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    body: pr.body ?? undefined,
    author: pr.user?.login ?? "unknown",
    avatarUrl: pr.user?.avatar_url,
    createdAt: pr.created_at,
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    headSha: pr.head.sha,
    state: pr.state as "open" | "closed",
    merged: pr.merged ?? false,
    draft: pr.draft ?? false,
    mergeableState: pr.mergeable_state ?? "unknown",
    hasChangeRequests,
    hasDismissedReviews,
    reviews,
    checks,
    threads,
    issueComments,
    currentUser: meRes.data.login,
  }
}

/** Same as getPRDetails but accepts owner/repo directly (no URL parsing needed). */
export async function getPRDetailsForOwnerRepo(owner: string, repo: string, prNumber: number): Promise<PRDetails> {
  return getPRDetails(`https://github.com/${owner}/${repo}`, prNumber)
}

/** Branch + base branch for a PR, used by the agent rebase + create flows. */
export async function getPRBranchInfo(owner: string, repo: string, prNumber: number): Promise<{ branch: string; baseBranch: string }> {
  const octokit = getOctokit()
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  return { branch: pr.head.ref, baseBranch: pr.base.ref }
}
