import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { replyToReviewComment } from "../prComments.js"
import { defineTagHandler, type TagHandler, type TagOutcome } from "../../agent-runner/agent-runner.types.js"
import { logger } from "../../../logger.js"

/** Known PR coordinates, filled into the gh examples when the failure happens
 *  after we've already resolved them (the API-error path). */
interface ReplyContext {
  owner: string
  repo: string
  prNumber: number
}

/**
 * Build the follow-up the runner delivers back to the agent when a reply could
 * NOT be posted. Without this the tag is stripped from the transcript and the
 * agent wrongly believes the reply went through. The message tells it to post
 * with `gh` directly and NOT to re-emit the tag, so it can't loop. When the PR
 * coordinates are known, the gh examples are filled in with real values.
 */
function replyFailedFollowUp(commentId: string, reason: string, ctx?: ReplyContext): TagOutcome {
  const repoSlug = ctx ? `${ctx.owner}/${ctx.repo}` : "OWNER/REPO"
  const prRef = ctx ? String(ctx.prNumber) : "PR_NUMBER"
  return {
    followUp: {
      sender: "PR Reply",
      content: [
        `Your \`<huxflux:pr.reply commentId="${commentId}">\` reply was NOT posted to GitHub (${reason}).`,
        `The reply tag did not work, so nothing was sent — do not assume the reviewer saw it.`,
        ``,
        `Post the reply yourself with the gh CLI instead:`,
        `  gh api repos/${repoSlug}/pulls/comments/${commentId}/replies -f body='your reply'`,
        `If that comment is a general PR conversation comment (not an inline review comment), use:`,
        `  gh pr comment ${prRef} --body 'your reply'`,
        ``,
        `Do NOT emit the huxflux:pr.reply tag again for this comment.`,
      ].join("\n"),
    },
  }
}

/**
 * `<huxflux:pr.reply commentId="123">my reply</huxflux:pr.reply>`
 *
 * Posts a reply to a GitHub review-comment thread on the agent's linked PR.
 * When it can't (no repo, no PR number, unparseable repo name, or a GitHub API
 * failure) it returns a follow-up so the agent learns the reply did not post
 * and can fall back to `gh`.
 */
export function prReplyHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "pr.reply",
    args: z.object({ commentId: z.string().min(1) }),
    onTag: async ({ args, body }): Promise<TagOutcome | void> => {
      const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (!agent?.repoId) {
        logger.warn(`[tags] pr.reply: agent ${agentId} has no repoId, skipping`)
        return replyFailedFollowUp(args.commentId, "this workspace has no linked repo")
      }
      if (!agent.prNumber) {
        logger.warn(`[tags] pr.reply: agent ${agentId} has no prNumber, skipping`)
        return replyFailedFollowUp(args.commentId, "this workspace has no linked PR")
      }
      const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
      if (!repo) {
        logger.warn(`[tags] pr.reply: repo ${agent.repoId} not found, skipping`)
        return replyFailedFollowUp(args.commentId, "the linked repo could not be found")
      }
      const [owner, repoName] = repo.name.includes("/") ? repo.name.split("/") : ["", repo.name]
      if (!owner || !repoName) {
        logger.warn(`[tags] pr.reply: could not parse owner/repo from "${repo.name}"`)
        return replyFailedFollowUp(args.commentId, `could not parse owner/repo from "${repo.name}"`)
      }
      const commentIdN = parseInt(args.commentId, 10)
      if (!Number.isFinite(commentIdN)) {
        logger.warn(`[tags] pr.reply: commentId "${args.commentId}" is not a number`)
        return replyFailedFollowUp(args.commentId, `"${args.commentId}" is not a valid numeric comment id`)
      }
      try {
        await replyToReviewComment(owner, repoName, agent.prNumber, commentIdN, body.trim(), { fallbackToConversation: true })
        logger.info(`[tags] pr.reply: replied to ${commentIdN} on ${owner}/${repoName}#${agent.prNumber}`)
      } catch (err) {
        logger.error({ err }, `[tags] pr.reply: failed for comment ${args.commentId}`)
        const reason = err instanceof Error ? err.message : "GitHub API error"
        return replyFailedFollowUp(args.commentId, reason, { owner, repo: repoName, prNumber: agent.prNumber })
      }
    },
  })
}
