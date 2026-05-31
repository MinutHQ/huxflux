import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { agentsListRoutes } from "./agents.list.routes.js"
import { agentsCreateRoutes } from "./agents.create.routes.js"
import { agentsUpdateRoutes } from "./agents.update.routes.js"
import { agentsBranchRoutes } from "./agents.branch.routes.js"
import { agentsLifecycleRoutes } from "./agents.lifecycle.routes.js"
import { agentsMiscRoutes } from "./agents.misc.routes.js"
import { statsRoutes } from "./stats.routes.js"
import { uploadRoutes } from "./upload.routes.js"

/**
 * Compose all agent-resource routes. Order matters because of Fastify route
 * registration — lifecycle (DELETE /api/agents/:id) registers before list's
 * GET /api/agents/:id since they share the path but use different verbs.
 */
export const agentsRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(agentsListRoutes)
  await app.register(agentsCreateRoutes)
  await app.register(agentsUpdateRoutes)
  await app.register(agentsBranchRoutes)
  await app.register(agentsLifecycleRoutes)
  await app.register(agentsMiscRoutes)
  await app.register(statsRoutes)
  await app.register(uploadRoutes)
}
