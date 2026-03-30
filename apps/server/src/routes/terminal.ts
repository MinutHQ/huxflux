import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, terminalLines } from "../db/schema.js"

export async function terminalRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/terminal — get terminal lines
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/agents/:id/terminal",
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
