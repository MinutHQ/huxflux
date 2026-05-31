import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { listRoutes } from "./routes/list.routes.js"
import { crudRoutes } from "./routes/crud.routes.js"
import { agentsRoutes } from "./routes/agents.routes.js"
import { commentsRoutes } from "./routes/comments.routes.js"
import { dependenciesRoutes } from "./routes/dependencies.routes.js"
import { jiraRoutes } from "./routes/jira.routes.js"
import { refineRoutes } from "./routes/refine.routes.js"
import { startWorkRoutes } from "./routes/startWork.routes.js"

/**
 * Fastify plugin for the tasks domain. Composes every task-related HTTP
 * surface: tree list, task CRUD, task↔agent linkage, comments, sibling
 * dependencies, Jira sync / transition / status, the refine chat flow,
 * and the start-work agent-spawn endpoint.
 */
export const tasksPlugin: FastifyPluginAsyncZod = async (app) => {
  await app.register(listRoutes)
  await app.register(crudRoutes)
  await app.register(agentsRoutes)
  await app.register(commentsRoutes)
  await app.register(dependenciesRoutes)
  await app.register(jiraRoutes)
  await app.register(refineRoutes)
  await app.register(startWorkRoutes)
}
