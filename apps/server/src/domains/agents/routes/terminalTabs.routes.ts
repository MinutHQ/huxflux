import type { FastifyReply } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { v4 as uuid } from "uuid"
import { eq, and } from "drizzle-orm"
import { terminalTabUpdateBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { terminalTabs, agents } from "../../../db/schema.js"
import { killTerminal } from "../../ws/pty.js"

const idParamsSchema = z.object({ id: z.string() })
const tabParamsSchema = z.object({ id: z.string(), terminalId: z.string() })

export const terminalTabsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/agents/:id/terminal-tabs", {
    schema: { params: idParamsSchema },
  }, (req, reply) => listTabsHandler(req.params.id, reply))
  app.post("/api/agents/:id/terminal-tabs", {
    schema: { params: idParamsSchema },
  }, (req, reply) => createTabHandler(req.params.id, reply))
  app.patch(
    "/api/agents/:id/terminal-tabs/:terminalId",
    { schema: { params: tabParamsSchema, body: terminalTabUpdateBodySchema } },
    (req, reply) => {
      return updateTabHandler(req.params.id, req.params.terminalId, req.body.label, reply)
    },
  )
  app.delete(
    "/api/agents/:id/terminal-tabs/:terminalId",
    { schema: { params: tabParamsSchema } },
    (req, reply) => deleteTabHandler(req.params.id, req.params.terminalId, reply),
  )
}

async function listTabsHandler(agentId: string, reply: FastifyReply): Promise<unknown> {
  const agent = db.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).get()
  if (!agent) return reply.code(404).send({ error: "Not found" })

  return db.select().from(terminalTabs)
    .where(eq(terminalTabs.agentId, agentId))
    .all()
    .sort((a, b) => a.orderIdx - b.orderIdx)
}

async function createTabHandler(agentId: string, reply: FastifyReply): Promise<unknown> {
  const agent = db.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).get()
  if (!agent) return reply.code(404).send({ error: "Not found" })

  const existing = db.select({ orderIdx: terminalTabs.orderIdx })
    .from(terminalTabs)
    .where(eq(terminalTabs.agentId, agentId))
    .all()

  const nextOrderIdx = existing.length > 0
    ? Math.max(...existing.map((t) => t.orderIdx)) + 1
    : 0

  const id = uuid()
  // Use a short unique terminal ID derived from the tab UUID
  const terminalId = `t-${id.slice(0, 8)}`

  db.insert(terminalTabs).values({
    id,
    agentId,
    terminalId,
    label: null,
    orderIdx: nextOrderIdx,
  }).run()

  reply.code(201)
  return db.select().from(terminalTabs).where(eq(terminalTabs.id, id)).get()
}

async function updateTabHandler(
  agentId: string,
  terminalId: string,
  label: string | null,
  reply: FastifyReply,
): Promise<unknown> {
  const tab = db.select().from(terminalTabs)
    .where(and(eq(terminalTabs.agentId, agentId), eq(terminalTabs.terminalId, terminalId)))
    .get()
  if (!tab) return reply.code(404).send({ error: "Not found" })

  db.update(terminalTabs)
    .set({ label: label ?? null })
    .where(and(eq(terminalTabs.agentId, agentId), eq(terminalTabs.terminalId, terminalId)))
    .run()

  return db.select().from(terminalTabs)
    .where(and(eq(terminalTabs.agentId, agentId), eq(terminalTabs.terminalId, terminalId)))
    .get()
}

async function deleteTabHandler(
  agentId: string,
  terminalId: string,
  reply: FastifyReply,
): Promise<undefined> {
  const tab = db.select().from(terminalTabs)
    .where(and(eq(terminalTabs.agentId, agentId), eq(terminalTabs.terminalId, terminalId)))
    .get()
  if (!tab) { reply.code(404).send({ error: "Not found" }); return }

  // Kill the PTY process for this specific terminal
  killTerminal(`${agentId}:${terminalId}`)

  db.delete(terminalTabs)
    .where(and(eq(terminalTabs.agentId, agentId), eq(terminalTabs.terminalId, terminalId)))
    .run()

  reply.code(204)
  return
}
