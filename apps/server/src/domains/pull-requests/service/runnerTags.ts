import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { replyToReviewComment } from "../prComments.js"
import { defineTagHandler, type TagHandler } from "../../agent-runner/agent-runner.types.js"

/**
 * `<huxflux:pr.reply commentId="123">my reply</huxflux:pr.reply>`
 *
 * Posts a reply to a GitHub review-comment thread on the agent's linked PR.
 * No-ops when the agent has no repo, no PR number, or the repo name can't be
 * split into `owner/repo`. The agent is expected to fall back to `gh` in
 * those cases.
 */
export function prReplyHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "pr.reply",
    args: z.object({ commentId: z.string().min(1) }),
    onTag: async ({ args, body }) => {
      const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (!agent?.repoId) {
        console.warn(`[tags] pr.reply: agent ${agentId} has no repoId, skipping`)
        return
      }
      if (!agent.prNumber) {
        console.warn(`[tags] pr.reply: agent ${agentId} has no prNumber, skipping`)
        return
      }
      const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
      if (!repo) {
        console.warn(`[tags] pr.reply: repo ${agent.repoId} not found, skipping`)
        return
      }
      const [owner, repoName] = repo.name.includes("/") ? repo.name.split("/") : ["", repo.name]
      if (!owner || !repoName) {
        console.warn(`[tags] pr.reply: could not parse owner/repo from "${repo.name}"`)
        return
      }
      const commentIdN = parseInt(args.commentId, 10)
      if (!Number.isFinite(commentIdN)) {
        console.warn(`[tags] pr.reply: commentId "${args.commentId}" is not a number`)
        return
      }
      try {
        await replyToReviewComment(owner, repoName, agent.prNumber, commentIdN, body.trim())
        console.info(`[tags] pr.reply: replied to ${commentIdN} on ${owner}/${repoName}#${agent.prNumber}`)
      } catch (err) {
        console.error(`[tags] pr.reply: failed for comment ${args.commentId}:`, err)
      }
    },
  })
}
