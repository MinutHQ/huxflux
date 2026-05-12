import type { FastifyInstance } from "fastify"
import { eq, inArray, lt, and } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, repos } from "../db/schema.js"
import { runClaude, isAgentRunning } from "../claude/runner.js"
import * as path from "node:path"

export { generateTitle, deriveTitle } from "../agents/title.js"

type QueuedMessage = { content: string; worktreePath: string; model: string; planMode?: boolean; sender?: string; delegateFrom?: string; provider?: string; effort?: string }
const agentQueues = new Map<string, QueuedMessage[]>()

function enqueue(agentId: string, msg: QueuedMessage) {
  if (!agentQueues.has(agentId)) agentQueues.set(agentId, [])
  agentQueues.get(agentId)!.push(msg)
}

function drainQueue(agentId: string, app: FastifyInstance) {
  const queue = agentQueues.get(agentId)
  if (!queue || queue.length === 0) return
  if (isAgentRunning(agentId)) return
  const next = queue.shift()!
  runClaude(next.content, { agentId, worktreePath: next.worktreePath, model: next.model, planMode: next.planMode, delegateFrom: next.delegateFrom, sender: next.sender, provider: next.provider, effort: next.effort })
    .catch((err) => app.log.error(`Claude runner error for agent ${agentId}: ${err}`))
    .finally(() => drainQueue(agentId, app))
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
        .where(
          req.query.before
            ? and(eq(messages.agentId, id), lt(messages.createdAt, req.query.before))
            : eq(messages.agentId, id)
        )
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
            precedingText: tc.precedingText ?? undefined,
          })) : undefined,
        }
      })
    }
  )

  // POST /api/agents/:id/messages — send message, triggers Claude runner
  app.post<{
    Params: { id: string }
    Body: { content: string; planMode?: boolean; sender?: string; delegateFrom?: string; effort?: string }
  }>("/api/agents/:id/messages", async (req, reply) => {
    const { id } = req.params
    const { content, planMode, sender, delegateFrom, effort } = req.body

    const agent = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    // Determine worktree path
    let worktreePath: string | undefined
    if (agent.repoId) {
      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (repo) {
        worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      }
    }

    const opts: QueuedMessage = { content, worktreePath: worktreePath ?? process.cwd(), model: agent.model, planMode, sender, delegateFrom, provider: (agent as any).provider, effort }

    // If agent is busy, queue the message and return immediately
    if (isAgentRunning(id)) {
      enqueue(id, opts)
      reply.code(202)
      return { status: "queued" }
    }

    // Title and branch are set by the agent via <huxflux:title> and <huxflux:branch> tags.

    // Fire and forget — streaming happens over WebSocket; drain queue when done
    runClaude(content, { agentId: id, worktreePath: opts.worktreePath, model: opts.model, planMode: opts.planMode, delegateFrom: opts.delegateFrom, sender: opts.sender, provider: opts.provider, effort: opts.effort })
      .catch((err) => app.log.error(`Claude runner error for agent ${id}: ${err}`))
      .finally(() => drainQueue(id, app))

    reply.code(202)
    return { status: "running" }
  })
}
