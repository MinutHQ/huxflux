import type { FastifyReply } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq, inArray, isNull, and, count } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents, messages, toolCalls, fileChanges, terminalLines } from "../../../db/schema.js"
import { parsePrStatus } from "../../pull-requests/prStatus.js"
import { getAgentPortsFromDB, getAllPortsFromDB } from "../../git/processes.js"

const idParamsSchema = z.object({ id: z.string() })

/**
 * Routes that read agent state: the agent list, a single agent's full snapshot,
 * the list of child sessions, and port lookups.
 */
export const agentsListRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/agents — list (excludes child tabs, soft-deleted, and task refine agents)
  app.get("/api/agents", listAgentsHandler)

  // GET /api/agents/:id/ports — get listening ports from DB (instant)
  app.get("/api/agents/:id/ports", {
    schema: { params: idParamsSchema },
  }, async (req) => {
    return { ports: getAgentPortsFromDB(req.params.id) }
  })

  // GET /api/ports — all listening ports from DB (instant)
  app.get("/api/ports", async () => {
    return getAllPortsFromDB()
  })

  // GET /api/agents/:id/sessions — list child chat sessions (same worktree, different Claude sessions)
  app.get("/api/agents/:id/sessions", {
    schema: { params: idParamsSchema },
  }, async (req) => {
    return db.select().from(agents)
      .where(and(eq(agents.parentAgentId, req.params.id), isNull(agents.deletedAt)))
      .all()
  })

  // GET /api/agents/:id — full agent with messages + files + terminal
  app.get("/api/agents/:id", {
    schema: { params: idParamsSchema },
  }, (req, reply) => getAgentHandler(req.params.id, reply))
}

async function listAgentsHandler(): Promise<unknown[]> {
  const rows = db.select().from(agents).where(and(isNull(agents.parentAgentId), isNull(agents.deletedAt), isNull(agents.taskId))).all()
  if (rows.length === 0) return []

  const allFiles = db.select().from(fileChanges)
    .where(inArray(fileChanges.agentId, rows.map((r) => r.id)))
    .all()
  const filesByAgent = new Map<string, typeof allFiles>()
  for (const f of allFiles) {
    const list = filesByAgent.get(f.agentId) ?? []
    list.push(f)
    filesByAgent.set(f.agentId, list)
  }

  return rows.map((a) => {
    const files = filesByAgent.get(a.id) ?? []
    const additions = files.reduce((s, f) => s + f.additions, 0)
    const deletions = files.reduce((s, f) => s + f.deletions, 0)
    return {
      ...a,
      diffSummary: files.length > 0 ? { additions, deletions } : undefined,
      prStatus: parsePrStatus(a.prStatus),
    }
  })
}

async function getAgentHandler(id: string, reply: FastifyReply): Promise<unknown> {
  const agent = db.select().from(agents).where(and(eq(agents.id, id), isNull(agents.deletedAt))).get()
  if (!agent) return reply.code(404).send({ error: "Not found" })

  const MESSAGE_LIMIT = 50

  const totalMsgs = db.select({ count: count() }).from(messages)
    .where(eq(messages.agentId, agent.id))
    .get()?.count ?? 0

  const allMsgs = db.select().from(messages)
    .where(eq(messages.agentId, agent.id))
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const msgs = allMsgs.slice(-MESSAGE_LIMIT)
  const hasMore = totalMsgs > MESSAGE_LIMIT
  const messagesWithTools = attachToolCalls(msgs)

  const files = db.select().from(fileChanges).where(eq(fileChanges.agentId, agent.id)).all().sort((a, b) => a.path.localeCompare(b.path))
  const terminal = db.select().from(terminalLines)
    .where(eq(terminalLines.agentId, agent.id))
    .all()
    .map((t) => t.line)

  const additions = files.reduce((s, f) => s + f.additions, 0)
  const deletions = files.reduce((s, f) => s + f.deletions, 0)

  return {
    ...agent,
    messages: messagesWithTools,
    hasMore,
    fileChanges: files,
    terminalOutput: terminal,
    diffSummary: files.length > 0 ? { additions, deletions } : undefined,
    prStatus: parsePrStatus(agent.prStatus),
  }
}

function attachToolCalls(msgs: Array<typeof messages.$inferSelect>): unknown[] {
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
        precedingText: tc.precedingText ?? undefined,
      })) : undefined,
    }
  })
}
