import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { linkTaskAgentBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, tasks, taskAgents } from "../../../db/schema.js"
import { loadAllTasks } from "../service/loadTasks.js"

const idParamsSchema = z.object({ id: z.string() })
const taskAgentParamsSchema = z.object({ taskId: z.string(), agentId: z.string() })

/** Link / unlink agents to a task. */
export const agentsRoutes: FastifyPluginAsyncZod = async (app) => {
  // Link an agent to a task
  app.post("/api/tasks/:id/agents", {
    schema: { params: idParamsSchema, body: linkTaskAgentBodySchema },
  }, async (req) => {
    const { id: taskId } = req.params
    const { agentId } = req.body

    // Check both exist
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()
    if (!task || !agent) return { error: "not found" }

    // Upsert (ignore if already linked)
    const existing = db.select().from(taskAgents).where(eq(taskAgents.taskId, taskId)).all()
    if (!existing.some((e: { agentId: string }) => e.agentId === agentId)) {
      db.insert(taskAgents).values({ id: uuid(), taskId, agentId }).run()
    }

    return loadAllTasks()
  })

  // Unlink an agent
  app.delete("/api/tasks/:taskId/agents/:agentId", {
    schema: { params: taskAgentParamsSchema },
  }, async (req) => {
    const { taskId, agentId } = req.params
    const rows = db.select().from(taskAgents).where(eq(taskAgents.taskId, taskId)).all()
    const match = rows.find((r: { agentId: string }) => r.agentId === agentId)
    if (match) db.delete(taskAgents).where(eq(taskAgents.id, match.id)).run()
    return loadAllTasks()
  })
}
