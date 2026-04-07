import { Octokit } from "@octokit/rest"
import { config } from "../config.js"
import type { PRStatus, PRDetails, PRReview, PRCheck, PRThread, PRIssueComment, OpenPR, PRFileDiff } from "../types.js"

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

export async function resolveReviewThread(threadId: string): Promise<void> {
  const octokit = getOctokit()
  await octokit.graphql(
    `mutation ResolveThread($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { isResolved }
      }
    }`,
    { threadId }
  )
}

export async function listReviewRequestedPRs(): Promise<Array<OpenPR & { owner: string; repo: string }>> {
  const octokit = getOctokit()

  // Fetch both: PRs where review is requested AND PRs already reviewed by me
  const [{ data: requestedData }, { data: reviewedData }, { data: me }] = await Promise.all([
    octokit.search.issuesAndPullRequests({ q: "is:pr is:open review-requested:@me", per_page: 50, sort: "created", order: "desc" }),
    octokit.search.issuesAndPullRequests({ q: "is:pr is:open reviewed-by:@me", per_page: 50, sort: "created", order: "desc" }),
    octokit.users.getAuthenticated(),
  ])

  // Deduplicate by PR URL — requested takes priority for the reviewRequested flag
  const byUrl = new Map<string, { item: typeof requestedData.items[number]; fromReviewed: boolean }>()
  for (const item of requestedData.items) byUrl.set(item.html_url, { item, fromReviewed: false })
  for (const item of reviewedData.items) {
    if (!byUrl.has(item.html_url)) byUrl.set(item.html_url, { item, fromReviewed: true })
  }

  const results = await Promise.all(
    [...byUrl.values()].map(async ({ item, fromReviewed }) => {
      const match = item.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
      if (!match) return null
      const [, owner, repo] = match
      const prNumber = item.number

      let hasChangeRequests = false
      let reviewRequested = false
      let userReviewed = fromReviewed
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
        hasChangeRequests = [...latestByReviewer.values()].some((s) => s === "CHANGES_REQUESTED")
        reviewRequested = prRes.data.requested_reviewers?.some((r) => r.login === me.login) ?? false
        userReviewed = reviewsRes.data.some((r) => r.user?.id === me.id && r.state !== "DISMISSED")
      } catch { /* leave defaults */ }

      return {
        owner,
        repo,
        number: prNumber,
        title: item.title,
        author: (item.user?.login) ?? "unknown",
        authorAvatar: item.user?.avatar_url,
        branch: "",
        baseBranch: "",
        createdAt: item.created_at,
        hasChangeRequests,
        reviewRequested,
        userReviewed,
        draft: (item as any).draft ?? false,
        url: item.html_url,
      }
    })
  )

  return results.filter((r): r is NonNullable<typeof r> => r !== null)
}

export async function getPRBranchInfo(owner: string, repo: string, prNumber: number): Promise<{ branch: string; baseBranch: string }> {
  const octokit = getOctokit()
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  return { branch: pr.head.ref, baseBranch: pr.base.ref }
}

export async function getPRFilesForOwnerRepo(owner: string, repo: string, prNumber: number): Promise<PRFileDiff[]> {
  const octokit = getOctokit()
  const files = await octokit.paginate(octokit.pulls.listFiles, { owner, repo, pull_number: prNumber, per_page: 100 })
  return files.map((f) => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    status: f.status as PRFileDiff["status"],
    patch: f.patch,
  }))
}

export async function getPRDetailsForOwnerRepo(owner: string, repo: string, prNumber: number): Promise<PRDetails> {
  return getPRDetails(`https://github.com/${owner}/${repo}`, prNumber)
}

export async function replyToReviewComment(owner: string, repo: string, prNumber: number, commentId: number, body: string): Promise<void> {
  const octokit = getOctokit()
  await octokit.pulls.createReplyForReviewComment({ owner, repo, pull_number: prNumber, comment_id: commentId, body })
}

export async function createSinglePRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  path?: string,
  line?: number,
): Promise<void> {
  const octokit = getOctokit()
  if (path && line) {
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
    // Try RIGHT side first (added/context lines), then LEFT (removed lines)
    for (const side of ["RIGHT", "LEFT"] as const) {
      try {
        await octokit.pulls.createReviewComment({
          owner, repo, pull_number: prNumber,
          body, path, line, side,
          commit_id: pr.head.sha,
        })
        return
      } catch {
        // try next side
      }
    }
    // If neither side works, the line isn't in the diff — post at the nearest
    // hunk start line by using the diff to find the closest valid line
    const files = await octokit.paginate(octokit.pulls.listFiles, { owner, repo, pull_number: prNumber, per_page: 100 })
    const file = files.find((f) => f.filename === path)
    if (file?.patch) {
      const nearestLine = findNearestDiffLine(file.patch, line)
      if (nearestLine !== null && nearestLine !== line) {
        await octokit.pulls.createReviewComment({
          owner, repo, pull_number: prNumber,
          body: `*(originally line ${line})*\n\n${body}`, path, line: nearestLine, side: "RIGHT",
          commit_id: pr.head.sha,
        })
        return
      }
    }
    // Last resort: give up on inline and post as regular comment with context
    await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body: `**\`${path}:${line}\`**\n\n${body}` })
    return
  }
  await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body })
}

function findNearestDiffLine(patch: string, targetLine: number): number | null {
  // Parse hunk headers: @@ -a,b +c,d @@ — collect all new-file line numbers in the diff
  const lines: number[] = []
  let currentLine = 0
  for (const raw of patch.split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) { currentLine = parseInt(hunk[1], 10) - 1; continue }
    if (raw.startsWith("-")) continue
    currentLine++
    lines.push(currentLine)
  }
  if (lines.length === 0) return null
  return lines.reduce((best, l) => Math.abs(l - targetLine) < Math.abs(best - targetLine) ? l : best, lines[0])
}

export async function submitPRReview(
  owner: string,
  repo: string,
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string,
  comments: Array<{ path: string; line: number; body: string }>,
): Promise<void> {
  const octokit = getOctokit()
  // GitHub does not allow inline comments on APPROVE reviews
  const inlineComments = event === "APPROVE" ? [] : comments
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: pr.head.sha,
    event,
    body,
    comments: inlineComments.map((c) => ({ path: c.path, line: c.line, side: "RIGHT" as const, body: c.body })),
  })
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
        .catch(() => [])
    )
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

export async function getPRFiles(repoUrl: string, prNumber: number): Promise<PRFileDiff[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner, repo, pull_number: prNumber, per_page: 100,
  })

  return files.map((f) => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    status: f.status as PRFileDiff["status"],
    patch: f.patch,
  }))
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
  const branches = await octokit.paginate(octokit.repos.listBranches, { owner, repo, per_page: 100 })
  return branches.map((b) => b.name)
}


export async function getPRFileContent(
  owner: string,
  repo: string,
  prNumber: number,
  filePath: string,
  side: "base" | "head"
): Promise<string> {
  const octokit = getOctokit()
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  const ref = side === "base" ? pr.base.sha : pr.head.sha
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref })
    if (Array.isArray(data) || data.type !== "file") return ""
    return Buffer.from(data.content, "base64").toString("utf8")
  } catch {
    return ""
  }
}
