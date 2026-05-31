import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { startWorkForTask } from "../service/startWork.js"

const idParamsSchema = z.object({ id: z.string() })

/**
 * POST /api/tasks/:id/start-work — create a worktree + agent for the task,
 * transition the task to in-progress, and fire the initial implement-this
 * runAgent turn. Returns either `{ agentId, tasks }` or `{ error }`.
 *
 * No body. The model / provider / repo are derived from the task row itself.
 */
export const startWorkRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/api/tasks/:id/start-work", {
    schema: { params: idParamsSchema },
  }, async (req) => {
    return startWorkForTask(req.params.id)
  })
}
