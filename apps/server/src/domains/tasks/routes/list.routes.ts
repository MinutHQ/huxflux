import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { loadAllTasks } from "../service/loadTasks.js"

/** GET /api/tasks — load the full task tree. */
export const listRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/tasks", async () => {
    return loadAllTasks()
  })
}
