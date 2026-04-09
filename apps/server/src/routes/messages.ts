import type { FastifyInstance } from "fastify"
import { execFileSync, spawn } from "node:child_process"
import { eq, inArray, lt, and } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, repos } from "../db/schema.js"
import { runClaude, isAgentRunning } from "../claude/runner.js"
import * as path from "node:path"

let _claudeBin: string | null = null
function getClaudeBin(): string {
  if (_claudeBin) return _claudeBin
  if (process.env.CLAUDE_BIN) { _claudeBin = process.env.CLAUDE_BIN; return _claudeBin }
  try { _claudeBin = execFileSync("which", ["claude"], { encoding: "utf8" }).trim() }
  catch { _claudeBin = "claude" }
  return _claudeBin
}

/** Use an LLM to generate a short, descriptive title for a conversation. */
export async function generateTitle(content: string): Promise<string> {
  const prompt = `Generate a short title (max 6 words) for a coding conversation that starts with this message. Return ONLY the title, nothing else. No quotes, no punctuation at the end.\n\nMessage: ${content.slice(0, 500)}`

  return new Promise((resolve, reject) => {
    const proc = spawn(getClaudeBin(), [
      "--print",
      "--output-format", "text",
      "--model", "claude-haiku-4-5",
      "--max-turns", "1",
      prompt,
    ], { stdio: ["ignore", "pipe", "pipe"] })

    let output = ""
    proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString() })
    proc.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim().slice(0, 60))
      } else {
        reject(new Error(`Title generation failed (exit ${code})`))
      }
    })
    proc.on("error", reject)
  })
}

/** Fallback: derive a short title from the first user message. */
export function deriveTitle(content: string): string {
  const first = content.replace(/\s+/g, " ").trim().split(/[.\n!?]/)[0].trim()
  if (first.length <= 52) return first
  const cut = first.slice(0, 52)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…"
}

type QueuedMessage = { content: string; worktreePath: string; model: string; planMode?: boolean }
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
  runClaude(next.content, { agentId, worktreePath: next.worktreePath, model: next.model, planMode: next.planMode })
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
    Body: { content: string; planMode?: boolean }
  }>("/api/agents/:id/messages", async (req, reply) => {
    const { id } = req.params
    const { content, planMode } = req.body

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

    const opts: QueuedMessage = { content, worktreePath: worktreePath ?? process.cwd(), model: agent.model, planMode }

    // If agent is busy, queue the message and return immediately
    if (isAgentRunning(id)) {
      enqueue(id, opts)
      reply.code(202)
      return { status: "queued" }
    }

    // Auto-name the agent from the first user message using an LLM.
    const existingMessages = db.select().from(messages).where(eq(messages.agentId, id)).all()
    if (existingMessages.length === 0) {
      // Fire-and-forget: generate title in background, fall back to simple derivation
      generateTitle(content)
        .catch(() => deriveTitle(content))
        .then(async (autoTitle) => {
          const now = new Date().toISOString()
          db.update(agents).set({ title: autoTitle, updatedAt: now }).where(eq(agents.id, id)).run()
          const updated = db.select().from(agents).where(eq(agents.id, id)).get()
          if (updated) {
            const { emit } = await import("../ws/handler.js")
            emit(id, { type: "agent:updated", agent: updated as any })
          }
        })
        .catch(() => { /* title generation is best-effort */ })
    }

    // Fire and forget — streaming happens over WebSocket; drain queue when done
    runClaude(content, { agentId: id, worktreePath: opts.worktreePath, model: opts.model, planMode: opts.planMode })
      .catch((err) => app.log.error(`Claude runner error for agent ${id}: ${err}`))
      .finally(() => drainQueue(id, app))

    reply.code(202)
    return { status: "running" }
  })
}
