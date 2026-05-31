import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { addTaskDependencyBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { tasks, taskDependencies } from "../../../db/schema.js"
import { tasksWs } from "../tasks.ws.js"
import { loadAllTasks } from "../service/loadTasks.js"

const idParamsSchema = z.object({ id: z.string() })
const depParamsSchema = z.object({ taskId: z.string(), depId: z.string() })

/** Sibling-task dependency declarations (POST + DELETE). */
export const dependenciesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/api/tasks/:id/dependencies", {
    schema: { params: idParamsSchema, body: addTaskDependencyBodySchema },
  }, async (req) => {
    const { id: taskId } = req.params
    const { dependsOnTaskId } = req.body

    // Validate both tasks exist and are siblings
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
    const dep = db.select().from(tasks).where(eq(tasks.id, dependsOnTaskId)).get()
    if (!task || !dep) return { error: "Task not found" }
    if (task.parentId !== dep.parentId) return { error: "Dependencies must be between sibling tasks" }
    if (taskId === dependsOnTaskId) return { error: "Task cannot depend on itself" }

    // Check for existing
    const existing = db.select().from(taskDependencies).where(eq(taskDependencies.taskId, taskId)).all()
    if (existing.some((e: { dependsOnTaskId: string }) => e.dependsOnTaskId === dependsOnTaskId)) {
      return loadAllTasks() // already exists
    }

    db.insert(taskDependencies).values({ id: uuid(), taskId, dependsOnTaskId }).run()
    tasksWs.taskUpdated(taskId)
    return loadAllTasks()
  })

  app.delete("/api/tasks/:taskId/dependencies/:depId", {
    schema: { params: depParamsSchema },
  }, async (req) => {
    const { taskId, depId } = req.params
    db.delete(taskDependencies).where(eq(taskDependencies.id, depId)).run()
    tasksWs.taskUpdated(taskId)
    return loadAllTasks()
  })
}
