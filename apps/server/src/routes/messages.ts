import type { FastifyInstance } from "fastify"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, repos } from "../db/schema.js"
import { runClaude, isAgentRunning } from "../claude/runner.js"
import * as path from "node:path"

/** Derive a short human-readable title from the first user message. */
function deriveTitle(content: string): string {
  // Collapse whitespace and take the first sentence or line
  const first = content.replace(/\s+/g, " ").trim().split(/[.\n!?]/)[0].trim()
  if (first.length <= 52) return first
  // Truncate at the last word boundary before 52 chars
  const cut = first.slice(0, 52)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…"
}

export async function messagesRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/messages — paginated
  app.get<{ Params: { id: string }; Querystring: { limit?: string; before?: string } }>(
    "/api/agents/:id/messages",
    async (req, reply) => {
      const { id } = req.params
      const limit = parseInt(req.query.limit ?? "50", 10)

      const agent = db.select().from(agents).where(eq(agents.id, id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })

      const msgs = db.select().from(messages)
        .where(eq(messages.agentId, id))
        .all()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-limit)

      // Bulk-fetch all tool calls for these messages (avoids N+1)
      const msgIds = msgs.map((m) => m.id)
      const allToolCalls = msgIds.length > 0
        ? db.select().from(toolCalls).where(inArray(toolCalls.messageId, msgIds)).all()
        : []
      const toolCallsByMsg = new Map<string, typeof allToolCalls>()
      for (const tc of allToolCalls) {
        const list = toolCallsByMsg.get(tc.messageId) ?? []
        list.push(tc)
        toolCallsByMsg.set(tc.messageId, list)
      }

      return msgs.map((m) => {
        const tcs = (toolCallsByMsg.get(m.id) ?? []).sort((a, b) => a.orderIdx - b.orderIdx)
        return {
          ...m,
          toolCalls: tcs.length > 0 ? tcs.map((tc) => ({
            id: tc.id,
            tool: tc.tool,
            args: tc.args ?? undefined,
            result: tc.result ?? undefined,
            duration: tc.duration ?? undefined,
          })) : undefined,
        }
      })
    }
  )

  // POST /api/agents/:id/messages — send message, triggers Claude runner
  app.post<{
    Params: { id: string }
    Body: { content: string }
  }>("/api/agents/:id/messages", async (req, reply) => {
    const { id } = req.params
    const { content } = req.body

    const agent = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (isAgentRunning(id)) return reply.code(409).send({ error: "Agent already has a running process" })

    // Determine worktree path
    let worktreePath: string | undefined
    if (agent.repoId) {
      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (repo) {
        worktreePath = path.join(repo.workspacesPath, agent.location)
      }
    }

    // Auto-name the agent from the first user message if it still has the
    // default bee-style name (adj-noun) or has never had a message before.
    const existingMessages = db.select().from(messages).where(eq(messages.agentId, id)).all()
    if (existingMessages.length === 0) {
      const autoTitle = deriveTitle(content)
      const now = new Date().toISOString()
      db.update(agents).set({ title: autoTitle, updatedAt: now }).where(eq(agents.id, id)).run()
      const updated = db.select().from(agents).where(eq(agents.id, id)).get()
      if (updated) {
        const { emit } = await import("../ws/handler.js")
        emit(id, { type: "agent:updated", agent: updated as any })
      }
    }

    // Fire and forget — streaming happens over WebSocket
    runClaude(content, {
      agentId: id,
      worktreePath: worktreePath ?? process.cwd(),
      model: agent.model,
    }).catch((err) => {
      app.log.error(`Claude runner error for agent ${id}: ${err}`)
    })

    reply.code(202)
    return { status: "running" }
  })
}
