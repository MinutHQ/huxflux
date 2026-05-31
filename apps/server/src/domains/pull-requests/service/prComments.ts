import { getOctokit } from "./octokit.js"
import { findNearestDiffLine } from "./diffSnap.js"

/** Reply to a specific inline review comment by its REST comment id. */
export async function replyToReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  commentId: number,
  body: string,
): Promise<void> {
  const octokit = getOctokit()
  await octokit.pulls.createReplyForReviewComment({ owner, repo, pull_number: prNumber, comment_id: commentId, body })
}

/** Delete an inline review comment by its REST id. */
export async function deleteReviewComment(owner: string, repo: string, commentId: number): Promise<void> {
  const octokit = getOctokit()
  await octokit.pulls.deleteReviewComment({ owner, repo, comment_id: commentId })
}

/** Resolve a review thread via the GraphQL mutation (REST has no equivalent). */
export async function resolveReviewThread(threadId: string): Promise<void> {
  const octokit = getOctokit()
  await octokit.graphql(
    `mutation ResolveThread($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { isResolved }
      }
    }`,
    { threadId },
  )
}

async function tryInlineSides(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  path: string,
  line: number,
  headSha: string,
): Promise<boolean> {
  // Try RIGHT side first (added/context lines), then LEFT (removed lines)
  for (const side of ["RIGHT", "LEFT"] as const) {
    try {
      await octokit.pulls.createReviewComment({
        owner, repo, pull_number: prNumber,
        body, path, line, side,
        commit_id: headSha,
      })
      return true
    } catch {
      // try next side
    }
  }
  return false
}

async function tryNearestLineFallback(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  path: string,
  line: number,
  headSha: string,
): Promise<boolean> {
  // If neither side works, the line isn't in the diff — post at the nearest
  // hunk start line by using the diff to find the closest valid line
  const files = await octokit.paginate(octokit.pulls.listFiles, { owner, repo, pull_number: prNumber, per_page: 100 })
  const file = files.find((f) => f.filename === path)
  if (!file?.patch) return false
  const nearestLine = findNearestDiffLine(file.patch, line)
  if (nearestLine === null || nearestLine === line) return false
  await octokit.pulls.createReviewComment({
    owner, repo, pull_number: prNumber,
    body: `*(originally line ${line})*\n\n${body}`, path, line: nearestLine, side: "RIGHT",
    commit_id: headSha,
  })
  return true
}

/**
 * Post a single PR comment. If `path` + `line` are given, try inline (RIGHT
 * then LEFT side, then snap to nearest diff line); fall back to a plain issue
 * comment with `path:line` prefix if the line is not in the diff at all.
 */
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
    if (await tryInlineSides(octokit, owner, repo, prNumber, body, path, line, pr.head.sha)) return
    if (await tryNearestLineFallback(octokit, owner, repo, prNumber, body, path, line, pr.head.sha)) return
    // Last resort: give up on inline and post as regular comment with context
    await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body: `**\`${path}:${line}\`**\n\n${body}` })
    return
  }
  await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body })
}
