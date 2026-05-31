import { getOctokit, parseRepo } from "./octokit.js"

/** Create a PR on a remote. Used by the agent "create PR" route. */
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

/** Merge a PR using the explicit method if given, else the best allowed method for the repo. */
export async function mergePR(repoUrl: string, prNumber: number, method?: "merge" | "squash" | "rebase"): Promise<void> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  let mergeMethod = method
  if (!mergeMethod) {
    // Check which merge methods the repo allows and pick the best one
    const { data: repoData } = await octokit.repos.get({ owner, repo })
    if (repoData.allow_squash_merge) mergeMethod = "squash"
    else if (repoData.allow_merge_commit) mergeMethod = "merge"
    else if (repoData.allow_rebase_merge) mergeMethod = "rebase"
    else mergeMethod = "merge" // fallback
  }

  await octokit.pulls.merge({ owner, repo, pull_number: prNumber, merge_method: mergeMethod })
}

/** Returns the merge methods the repo allows, in the order the UI should prefer them. */
export async function getAllowedMergeMethods(repoUrl: string): Promise<("merge" | "squash" | "rebase")[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)
  const { data } = await octokit.repos.get({ owner, repo })
  const methods: ("merge" | "squash" | "rebase")[] = []
  if (data.allow_squash_merge) methods.push("squash")
  if (data.allow_merge_commit) methods.push("merge")
  if (data.allow_rebase_merge) methods.push("rebase")
  return methods
}

/** Convert a draft PR to ready-for-review (REST has no equivalent, so use GraphQL). */
export async function markPRReady(repoUrl: string, prNumber: number): Promise<void> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)
  // REST API doesn't support converting draft → ready; use GraphQL mutation
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  await octokit.graphql(
    `mutation MarkReady($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
    { id: pr.node_id },
  )
}

/** Re-request review from anyone whose latest review was CHANGES_REQUESTED or DISMISSED. */
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

  console.info(`[github] re-request review on PR #${prNumber}: reviewers=${JSON.stringify(reviewers)}`)

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
