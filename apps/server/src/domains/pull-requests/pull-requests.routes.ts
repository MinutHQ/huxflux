import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { listRoutes } from "./routes/list.routes.js"
import { detailsRoutes } from "./routes/details.routes.js"
import { commentsRoutes } from "./routes/comments.routes.js"
import { agentPrRoutes } from "./routes/agentPr.routes.js"
import { mergeRoutes } from "./routes/merge.routes.js"

/**
 * Fastify plugin for the pull-requests domain. Composes every PR-related
 * HTTP surface: listing review-requested PRs, fetching diff and file
 * content, review comment posting / submission / replies / deletion / thread
 * resolution, agent-scoped PR mutations, and owner/repo merge endpoints.
 */
export const pullRequestsPlugin: FastifyPluginAsyncZod = async (app) => {
  await app.register(listRoutes)
  await app.register(detailsRoutes)
  await app.register(commentsRoutes)
  await app.register(agentPrRoutes)
  await app.register(mergeRoutes)
}
