import type { PRStatus } from "../../../types.js"
import { getOctokit, parseRepo } from "./octokit.js"

/** Derive agent status from PR state. Shared between poller and PR routes. */
export function prStatusToAgentStatus(pr: PRStatus): string {
  if (pr.merged) return "done"
  if (pr.state === "closed") return "cancelled"
  if (pr.draft) return "in-progress"
  return "in-review"
}

/** Parse a JSON-encoded PRStatus string from the DB, returning undefined on failure. */
export function parsePrStatus(raw: string | null | undefined): PRStatus | undefined {
  if (!raw) return undefined
  try { return JSON.parse(raw) as PRStatus } catch { return undefined }
}

/** Fetch the up-to-date PR status (state, merged, draft, mergeable, review decision). */
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

/** Find the latest PR (open or closed) for a branch on the given remote. */
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
