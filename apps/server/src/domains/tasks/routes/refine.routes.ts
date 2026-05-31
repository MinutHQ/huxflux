import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { refineTaskBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, tasks } from "../../../db/schema.js"
import { runAgent } from "../../agent-runner/agent-runner.service.js"
import { getOrCreateRefineAgent, buildTaskContext } from "../service/refineAgent.js"
import { loadAllTasks } from "../service/loadTasks.js"
import {
  taskCommentHandler,
  taskUpdateHandler,
  taskCreateHandler,
  taskStatusHandler,
  taskDependencyHandler,
} from "../runnerTags.js"

const idParamsSchema = z.object({ id: z.string() })

/**
 * POST /api/tasks/:id/reply — append a user message to the hidden refine
 * agent for the task. The agent persists the user message + streams its
 * response via the normal runAgent path (no dual-write to task_comments —
 * the agent's messages table is the source of truth).
 */
export const refineRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/api/tasks/:id/reply", {
    schema: { params: idParamsSchema, body: refineTaskBodySchema },
  }, async (req) => {
    const { id: taskId } = req.params
    const { content } = req.body
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!task) return { error: "Task not found" }

    // Get or create the hidden refine agent
    const { agentId, cwd } = getOrCreateRefineAgent(taskId)
    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()!

    runAgent(content, {
      agentId,
      worktreePath: cwd,
      model: agent.model,
      provider: agent.provider,
      taskContext: buildTaskContext(task, taskId),
      tags: [
        taskCommentHandler(agentId),
        taskUpdateHandler(),
        taskCreateHandler(),
        taskStatusHandler(),
        taskDependencyHandler(),
      ],
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[task:refine] runAgent failed:`, message)
    })

    return { agentId, tasks: await loadAllTasks() }
  })
}
