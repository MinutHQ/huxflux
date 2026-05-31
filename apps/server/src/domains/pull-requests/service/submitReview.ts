import { getOctokit } from "./octokit.js"
import { findNearestDiffLine } from "./diffSnap.js"

type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT"

interface InputComment {
  path: string
  line: number
  body: string
  start_line?: number
}

// A SnappedComment has the same shape as the input but its `line` (and
// possibly `start_line`) has been moved to a valid line in the PR diff.
type SnappedComment = InputComment

function getDefaultReviewBody(event: ReviewEvent): string {
  switch (event) {
    case "APPROVE": return "LGTM"
    case "REQUEST_CHANGES": return "Changes requested"
    case "COMMENT": return "Review submitted"
  }
}

interface SnappedResult {
  validComments: SnappedComment[]
  fallbackLines: string[]
}

function snapComments(
  comments: InputComment[],
  files: Array<{ filename: string; patch?: string }>,
): SnappedResult {
  const validComments: SnappedComment[] = []
  const fallbackLines: string[] = []

  for (const c of comments) {
    const file = files.find((f) => f.filename === c.path)
    if (!file?.patch) {
      // File not in diff — move to body
      fallbackLines.push(`**\`${c.path}:${c.line}\`**\n${c.body}`)
      continue
    }
    const snappedLine = findNearestDiffLine(file.patch, c.line)
    if (snappedLine === null) {
      fallbackLines.push(`**\`${c.path}:${c.line}\`**\n${c.body}`)
      continue
    }
    const snappedStart = c.start_line && c.start_line !== c.line
      ? findNearestDiffLine(file.patch, c.start_line) ?? undefined
      : undefined
    validComments.push({
      ...c,
      line: snappedLine,
      body: snappedLine !== c.line ? `*(originally line ${c.line})*\n\n${c.body}` : c.body,
      start_line: snappedStart && snappedStart !== snappedLine ? snappedStart : undefined,
    })
  }

  return { validComments, fallbackLines }
}

/**
 * Submit a GitHub review with optional inline comments. Comments whose line
 * is not in the diff are snapped to the nearest diff line; if no nearby line
 * exists, they're appended to the review body with a `path:line` prefix so
 * the reviewer's intent is preserved.
 */
export async function submitPRReview(
  owner: string,
  repo: string,
  prNumber: number,
  event: ReviewEvent,
  body: string,
  comments: InputComment[],
): Promise<void> {
  const octokit = getOctokit()
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })

  // Fetch PR files to validate comment line numbers against the diff
  const { data: files } = await octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 300 })

  const { validComments, fallbackLines } = snapComments(comments, files)

  const mappedComments = validComments.map((c) => ({
    path: c.path,
    line: c.line,
    side: "RIGHT" as const,
    body: c.body,
    ...(c.start_line && c.start_line !== c.line ? { start_line: c.start_line, start_side: "RIGHT" as const } : {}),
  }))

  // Append any comments that couldn't be placed inline to the review body
  const parts = [body, ...fallbackLines].filter(Boolean)
  const reviewBody = parts.join("\n\n") || (mappedComments.length === 0 ? getDefaultReviewBody(event) : "")

  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: pr.head.sha,
    event,
    body: reviewBody,
    comments: mappedComments,
  })
}
