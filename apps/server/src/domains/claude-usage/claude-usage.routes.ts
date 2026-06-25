import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { claudeUsageSchema } from "@huxflux/shared"
import { fetchClaudeUsage } from "./claude-usage.service.js"

export const claudeUsagePlugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/claude/usage", {
    schema: { response: { 200: claudeUsageSchema } },
  }, async () => fetchClaudeUsage())
}
