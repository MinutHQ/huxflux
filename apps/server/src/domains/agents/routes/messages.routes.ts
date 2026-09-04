import type { FastifyReply } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq, inArray, lt, and } from "drizzle-orm"
import { sendMessageBodySchema, type SendMessageBody } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, messages, toolCalls, repos } from "../../../db/schema.js"
import { enqueue, drainQueue } from "../service/messageQueue.js"
import { isAgentRunning, injectUserMessage } from "../../agent-runner/agent-runner.service.js"
import type { QueuedMessage } from "../agents.types.js"
import * as path from "node:path"

const idParamsSchema = z.object({ id: z.string() })
const messagesQuerySchema = z.object({
  limit: z.string().optional(),
  before: z.string().optional(),
})

export const messagesRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/agents/:id/messages — paginated
  app.get(
    "/api/agents/:id/messages",
    { schema: { params: idParamsSchema, querystring: messagesQuerySchema } },
    (req, reply) => listMessagesHandler(req.params.id, req.query.limit, req.query.before, reply),
  )

  // POST /api/agents/:id/messages — send message, triggers Claude runner
  app.post(
    "/api/agents/:id/messages",
    { schema: { params: idParamsSchema, body: sendMessageBodySchema } },
    (req, reply) => sendMessageHandler(req.params.id, req.body, reply),
  )
}

async function listMessagesHandler(
  id: string,
  limit: string | undefined,
  before: string | undefined,
  reply: FastifyReply,
): Promise<unknown> {
  const limitN = parseInt(limit ?? "50", 10)

  const agent = db.select().from(agents).where(eq(agents.id, id)).get()
  if (!agent) return reply.code(404).send({ error: "Not found" })

  const msgs = db.select().from(messages)
    .where(
      before
        ? and(eq(messages.agentId, id), lt(messages.createdAt, before))
        : eq(messages.agentId, id)
    )
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limitN)

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

async function sendMessageHandler(
  id: string,
  body: SendMessageBody,
  reply: FastifyReply,
): Promise<unknown> {
  const { content, planMode, sender, delegateFrom, effort } = body

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

  const opts: QueuedMessage = {
    content,
    worktreePath: worktreePath ?? process.cwd(),
    model: agent.model,
    planMode,
    sender,
    delegateFrom,
    provider: agent.provider ?? undefined,
    effort,
  }

  // While a turn is running, deliver the message into it (the CLI hands it to
  // the model at the next step boundary). Plan-mode messages always start
  // their own turn, and providers without a stdin pipe fall back to the queue.
  if (!planMode && isAgentRunning(id) && injectUserMessage(id, content, sender)) {
    reply.code(202)
    return { status: "injected" }
  }

  enqueue(id, opts)
  drainQueue(id)

  reply.code(202)
  return { status: "queued" }
}
