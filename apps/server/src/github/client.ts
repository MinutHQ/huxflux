import { Octokit } from "@octokit/rest"
import { config } from "../config.js"
import type { PRStatus, PRDetails, PRReview, PRCheck, PRThread, PRIssueComment } from "../types.js"

function getOctokit() {
  return new Octokit({ auth: config.githubToken || undefined })
}

function parseRepo(repoUrl: string): { owner: string; repo: string } {
  // git@<any-host>:<owner>/<repo>.git  (SSH, including host aliases)
  const ssh = repoUrl.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (ssh) return { owner: ssh[1], repo: ssh[2] }

  // https://github.com/owner/repo or github.com/owner/repo
  const https = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (https) return { owner: https[1], repo: https[2] }

  // owner/repo shorthand
  const short = repoUrl.match(/^([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (short) return { owner: short[1], repo: short[2] }

  throw new Error(`Cannot parse repo URL: ${repoUrl}`)
}

export async function createPR(params: {
  repoUrl: string
  branch: string
  baseBranch: string
  title: string
  body?: string
  draft?: boolean
}): Promise<{ url: string; number: number }> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(params.repoUrl)
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    head: params.branch,
    base: params.baseBranch,
    title: params.title,
    body: params.body ?? "",
    draft: params.draft ?? false,
  })
  return { url: data.html_url, number: data.number }
}

export async function getPRStatus(repoUrl: string, prNumber: number): Promise<PRStatus> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  const [prRes, reviewsRes] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
  ])

  const pr = prRes.data

  // Determine review decision: find latest review state per reviewer
  const latestByReviewer = new Map<number, string>()
  for (const review of reviewsRes.data) {
    if (review.user && review.state !== "COMMENTED") {
      latestByReviewer.set(review.user.id, review.state)
    }
  }
  const hasChangeRequests = [...latestByReviewer.values()].some((s) => s === "CHANGES_REQUESTED")
  const hasDismissedReviews = [...latestByReviewer.values()].some((s) => s === "DISMISSED")

  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.state as "open" | "closed",
    merged: pr.merged ?? false,
    draft: pr.draft ?? false,
    mergeableState: pr.mergeable_state ?? "unknown",
    hasChangeRequests,
    hasDismissedReviews,
  }
}

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

async function fetchReviewThreads(octokit: ReturnType<typeof getOctokit>, owner: string, repo: string, prNumber: number): Promise<GQLThreadsResult> {
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

export async function getPRDetails(repoUrl: string, prNumber: number): Promise<PRDetails> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  const [prRes, reviewsRes, checksRes, issueCommentsRes, threadsData] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.checks.listForRef({ owner, repo, ref: `refs/pull/${prNumber}/head`, per_page: 100 })
      .catch(() => ({ data: { check_runs: [] } })),
    octokit.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 100 }),
    fetchReviewThreads(octokit, owner, repo, prNumber)
      .catch(() => ({ repository: { pullRequest: { reviewThreads: { nodes: [] } } } } as GQLThreadsResult)),
  ])

  const pr = prRes.data

  // Latest review state per reviewer
  const latestByReviewer = new Map<number, { state: string; login: string; avatar: string; submittedAt?: string }>()
  for (const review of reviewsRes.data) {
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

  const checks: PRCheck[] = checksRes.data.check_runs.map((c) => ({
    name: c.name,
    status: c.status as PRCheck["status"],
    conclusion: (c.conclusion ?? null) as PRCheck["conclusion"],
    url: c.html_url ?? undefined,
  }))

  const threads: PRThread[] = threadsData.repository.pullRequest.reviewThreads.nodes.map((t) => ({
    id: t.id,
    isResolved: t.isResolved,
    isOutdated: t.isOutdated,
    path: t.path,
    line: t.line ?? t.originalLine ?? undefined,
    comments: t.comments.nodes.map((c) => ({
      id: c.id,
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
  }
}

export async function findPRForBranch(repoUrl: string, branch: string): Promise<PRStatus | null> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  // Search open PRs first, then closed (for merged detection)
  for (const state of ["open", "closed"] as const) {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state,
      per_page: 1,
    })
    if (data.length > 0) {
      return getPRStatus(repoUrl, data[0].number)
    }
  }
  return null
}

export async function markPRReady(repoUrl: string, prNumber: number): Promise<void> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)
  // REST API doesn't support converting draft → ready; use GraphQL mutation
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  await octokit.graphql(
    `mutation MarkReady($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
    { id: pr.node_id }
  )
}

export async function rerequestReview(repoUrl: string, prNumber: number): Promise<void> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  // Find reviewers whose latest review state is CHANGES_REQUESTED
  const { data: reviews } = await octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 })
  const latestByReviewer = new Map<number, { login: string; state: string }>()
  for (const review of reviews) {
    if (review.user && review.state !== "COMMENTED") {
      latestByReviewer.set(review.user.id, { login: review.user.login, state: review.state })
    }
  }
  const reviewers = [...latestByReviewer.values()]
    .filter((r) => r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED")
    .map((r) => r.login)

  console.log(`[github] re-request review on PR #${prNumber}: reviewers=${JSON.stringify(reviewers)}`)

  if (reviewers.length === 0) {
    throw new Error("No reviewers with changes requested found")
  }

  try {
    await octokit.pulls.requestReviewers({ owner, repo, pull_number: prNumber, reviewers })
  } catch (err) {
    console.error(`[github] requestReviewers failed:`, err)
    throw err
  }
}

export async function createIssue(params: {
  owner: string
  repo: string
  title: string
  body?: string
  labels?: string[]
}): Promise<{ url: string; number: number }> {
  const octokit = getOctokit()
  const { data } = await octokit.issues.create({
    owner: params.owner,
    repo: params.repo,
    title: params.title,
    body: params.body ?? "",
    labels: params.labels,
  })
  return { url: data.html_url, number: data.number }
}

export async function listBranches(repoUrl: string): Promise<string[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)
  const { data } = await octokit.repos.listBranches({ owner, repo, per_page: 100 })
  return data.map((b) => b.name)
}
