import type { OpenPR } from "../../../types.js"
import { getOctokit, parseRepo } from "./octokit.js"

/** Create an issue on a repo. Used by the feedback domain. */
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

/** List branch names on a repo. Used by the repos domain to populate base-branch pickers. */
export async function listBranches(repoUrl: string): Promise<string[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)
  const branches = await octokit.paginate(octokit.repos.listBranches, { owner, repo, per_page: 100 })
  return branches.map((b) => b.name)
}

/** Legacy: list open PRs on a single remote, enriched with reviewer state. Kept for parity. */
export async function listOpenPRs(repoUrl: string): Promise<OpenPR[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  const [{ data: prs }, { data: me }] = await Promise.all([
    octokit.pulls.list({ owner, repo, state: "open", per_page: 50 }),
    octokit.users.getAuthenticated(),
  ])
  if (prs.length === 0) return []

  // Fetch reviews for all PRs in parallel
  const reviewsPerPR = await Promise.all(
    prs.map((pr) =>
      octokit.pulls.listReviews({ owner, repo, pull_number: pr.number, per_page: 100 })
        .then((r) => r.data)
        .catch(() => []),
    ),
  )

  return prs.map((pr, i) => {
    const reviews = reviewsPerPR[i]
    const latestByReviewer = new Map<number, string>()
    for (const review of reviews) {
      if (review.user && review.state !== "COMMENTED") {
        latestByReviewer.set(review.user.id, review.state)
      }
    }
    const hasChangeRequests = [...latestByReviewer.values()].some((s) => s === "CHANGES_REQUESTED")
    const reviewRequested = pr.requested_reviewers?.some((r) => r.login === me.login) ?? false
    // Reviewed if the authenticated user has any non-DISMISSED review on this PR
    const userReviewed = reviews.some((r) => r.user?.id === me.id && r.state !== "DISMISSED")
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      authorAvatar: pr.user?.avatar_url,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      createdAt: pr.created_at,
      hasChangeRequests,
      draft: pr.draft ?? false,
      url: pr.html_url,
      reviewRequested,
      userReviewed,
    }
  })
}
