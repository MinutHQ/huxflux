import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { v4 as uuid } from "uuid"
import { addTaskCommentBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { taskComments } from "../../../db/schema.js"
import { loadAllTasks } from "../service/loadTasks.js"

const idParamsSchema = z.object({ id: z.string() })

/** POST /api/tasks/:id/comments — append a comment to a task. */
export const commentsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/api/tasks/:id/comments", {
    schema: { params: idParamsSchema, body: addTaskCommentBodySchema },
  }, async (req) => {
    const { id: taskId } = req.params
    const { author, role, content } = req.body

    db.insert(taskComments).values({
      id: uuid(),
      taskId,
      author,
      role,
      content,
      createdAt: new Date().toISOString(),
    }).run()

    return loadAllTasks()
  })
}
