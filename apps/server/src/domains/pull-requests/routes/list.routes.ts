import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { and, isNotNull, isNull } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents } from "../../../db/schema.js"
import type { OpenPRWithRepo } from "../../../types.js"
import { listReviewRequestedPRs } from "../service/listRequestedPRs.js"

/**
 * GET /api/prs — list open PRs where the authenticated user is a requested
 * reviewer (or has already reviewed). Each entry is decorated with the local
 * `agentId` if the PR URL matches an agent in the DB so the client can link
 * back to the right agent thread.
 */
export const listRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/prs", async () => {
    const rawPRs = await listReviewRequestedPRs()

    // Look up agents by their PR URL to associate agentId with each PR
    const allAgents = db.select({ id: agents.id, pr: agents.pr })
      .from(agents)
      .where(and(isNull(agents.deletedAt), isNotNull(agents.pr)))
      .all()
    const agentByPrUrl = new Map<string, string>()
    for (const a of allAgents) {
      if (a.pr) agentByPrUrl.set(a.pr, a.id)
    }

    return rawPRs.map((pr): OpenPRWithRepo => ({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      authorAvatar: pr.authorAvatar,
      branch: pr.branch,
      baseBranch: pr.baseBranch,
      body: pr.body,
      additions: pr.additions,
      deletions: pr.deletions,
      createdAt: pr.createdAt,
      hasChangeRequests: pr.hasChangeRequests,
      draft: pr.draft,
      url: pr.url,
      reviewRequested: pr.reviewRequested,
      userReviewed: pr.userReviewed,
      isReadyToMerge: pr.mergeableState === "clean" && !pr.hasChangeRequests && !pr.draft,
      repoId: `${pr.owner}/${pr.repo}`,
      repoName: `${pr.owner}/${pr.repo}`,
      agentId: agentByPrUrl.get(pr.url),
    }))
  })
}
