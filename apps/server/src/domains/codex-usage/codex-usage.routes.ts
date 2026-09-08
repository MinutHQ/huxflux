import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { codexUsageSchema } from "@huxflux/shared"
import { fetchCodexUsage } from "./codex-usage.service.js"

export const codexUsagePlugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/codex/usage", {
    schema: { response: { 200: codexUsageSchema } },
  }, async () => fetchCodexUsage())
}
