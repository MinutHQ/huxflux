import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { agentsRoutes } from "./routes/agents.routes.js"
import { messagesRoutes } from "./routes/messages.routes.js"
import { filesRoutes } from "./routes/files.routes.js"
import { terminalRoutes } from "./routes/terminal.routes.js"
import { terminalTabsRoutes } from "./routes/terminalTabs.routes.js"
import { slashCommandsRoutes } from "./routes/slashCommands.routes.js"

/**
 * Fastify plugin for the agents domain. Composes every agent-related HTTP
 * surface: agent CRUD, messages, file changes, terminal output, terminal tabs,
 * slash commands. The central server entrypoint registers this single plugin
 * (via the `domains/index.ts` registry) instead of the six individual route
 * files that pre-existed before the domain extraction.
 */
export const agentsPlugin: FastifyPluginAsyncZod = async (app) => {
  await app.register(agentsRoutes)
  await app.register(messagesRoutes)
  await app.register(filesRoutes)
  await app.register(terminalRoutes)
  await app.register(terminalTabsRoutes)
  await app.register(slashCommandsRoutes)
}
