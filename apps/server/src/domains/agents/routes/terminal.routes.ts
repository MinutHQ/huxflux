import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents, terminalLines } from "../../../db/schema.js"

const idParamsSchema = z.object({ id: z.string() })
const limitQuerySchema = z.object({ limit: z.string().optional() })

export const terminalRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/agents/:id/terminal — get terminal lines
  app.get(
    "/api/agents/:id/terminal",
    { schema: { params: idParamsSchema, querystring: limitQuerySchema } },
    async (req, reply) => {
      const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })

      const limit = parseInt(req.query.limit ?? "500", 10)
      const lines = db.select().from(terminalLines)
        .where(eq(terminalLines.agentId, req.params.id))
        .all()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-limit)
        .map((t) => t.line)

      return lines
    }
  )
}
