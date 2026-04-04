import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import { eq, and } from "drizzle-orm"
import { db } from "../db/index.js"
import { terminalTabs, agents } from "../db/schema.js"
import { killTerminal } from "../ws/pty.js"

export async function terminalTabsRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/terminal-tabs — list all tabs for agent, ordered by orderIdx
  app.get<{ Params: { id: string } }>("/api/agents/:id/terminal-tabs", async (req, reply) => {
    const agent = db.select({ id: agents.id }).from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    const tabs = db.select().from(terminalTabs)
      .where(eq(terminalTabs.agentId, req.params.id))
      .all()
      .sort((a, b) => a.orderIdx - b.orderIdx)

    return tabs
  })

  // POST /api/agents/:id/terminal-tabs — create a new terminal tab
  app.post<{ Params: { id: string } }>("/api/agents/:id/terminal-tabs", async (req, reply) => {
    const agent = db.select({ id: agents.id }).from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    const existing = db.select({ orderIdx: terminalTabs.orderIdx })
      .from(terminalTabs)
      .where(eq(terminalTabs.agentId, req.params.id))
      .all()

    const nextOrderIdx = existing.length > 0
      ? Math.max(...existing.map((t) => t.orderIdx)) + 1
      : 0

    const id = uuid()
    // Use a short unique terminal ID derived from the tab UUID
    const terminalId = `t-${id.slice(0, 8)}`

    db.insert(terminalTabs).values({
      id,
      agentId: req.params.id,
      terminalId,
      label: null,
      orderIdx: nextOrderIdx,
    }).run()

    const created = db.select().from(terminalTabs).where(eq(terminalTabs.id, id)).get()
    reply.code(201)
    return created
  })

  // PATCH /api/agents/:id/terminal-tabs/:terminalId — update label
  app.patch<{
    Params: { id: string; terminalId: string }
    Body: { label: string | null }
  }>("/api/agents/:id/terminal-tabs/:terminalId", async (req, reply) => {
    const tab = db.select().from(terminalTabs)
      .where(and(
        eq(terminalTabs.agentId, req.params.id),
        eq(terminalTabs.terminalId, req.params.terminalId),
      ))
      .get()
    if (!tab) return reply.code(404).send({ error: "Not found" })

    db.update(terminalTabs)
      .set({ label: req.body.label ?? null })
      .where(and(
        eq(terminalTabs.agentId, req.params.id),
        eq(terminalTabs.terminalId, req.params.terminalId),
      ))
      .run()

    const updated = db.select().from(terminalTabs)
      .where(and(
        eq(terminalTabs.agentId, req.params.id),
        eq(terminalTabs.terminalId, req.params.terminalId),
      ))
      .get()
    return updated
  })

  // DELETE /api/agents/:id/terminal-tabs/:terminalId — delete tab and kill its PTY
  app.delete<{ Params: { id: string; terminalId: string } }>(
    "/api/agents/:id/terminal-tabs/:terminalId",
    async (req, reply) => {
      const tab = db.select().from(terminalTabs)
        .where(and(
          eq(terminalTabs.agentId, req.params.id),
          eq(terminalTabs.terminalId, req.params.terminalId),
        ))
        .get()
      if (!tab) return reply.code(404).send({ error: "Not found" })

      // Kill the PTY process for this specific terminal
      killTerminal(`${req.params.id}:${req.params.terminalId}`)

      db.delete(terminalTabs)
        .where(and(
          eq(terminalTabs.agentId, req.params.id),
          eq(terminalTabs.terminalId, req.params.terminalId),
        ))
        .run()

      reply.code(204)
      return
    }
  )
}
