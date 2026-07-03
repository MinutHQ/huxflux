import { getOctokit } from "./octokit.js"
import { findNearestDiffLine } from "./diffSnap.js"
import { logger } from "../../../logger.js"

/**
 * True when an Octokit error means `comment_id` is not a top-level review
 * comment — i.e. it's a general PR conversation (issue) comment, or a reply
 * that isn't the root of its thread. GitHub answers 404 (no such review
 * comment) or 422 (not repliable) in those cases; anything else (auth, rate
 * limit, network) is a real failure the caller must see.
 */
export function isNotReviewCommentError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  return status === 404 || status === 422
}

/**
 * Reply to an inline review comment by its REST id.
 *
 * With `fallbackToConversation` the call also handles ids that are NOT a
 * review-thread root: if GitHub answers 404/422 it posts a top-level PR
 * conversation comment so the reply still lands. This is for the agent path,
 * where the id's kind (inline review vs general conversation comment) is not
 * known up front. The web-UI route leaves it off (default) because the user
 * picked a specific inline thread — a silent fallback would misplace the reply,
 * so a failure must surface. Throws when it can't post.
 */
export async function replyToReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  commentId: number,
  body: string,
  opts: { fallbackToConversation?: boolean } = {},
): Promise<void> {
  const octokit = getOctokit()
  try {
    await octokit.pulls.createReplyForReviewComment({ owner, repo, pull_number: prNumber, comment_id: commentId, body })
    return
  } catch (err) {
    if (!opts.fallbackToConversation || !isNotReviewCommentError(err)) throw err
    logger.info(`[prComments] comment ${commentId} is not a review-thread root; replying as a conversation comment`)
  }
  await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body })
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
