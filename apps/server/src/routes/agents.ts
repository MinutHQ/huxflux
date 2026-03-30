import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, fileChanges, terminalLines, repos } from "../db/schema.js"
import { createWorktree, removeWorktree, getDiffSummary } from "../git/worktrees.js"
import { broadcast } from "../ws/handler.js"
import { config } from "../config.js"
import * as path from "node:path"

export async function agentsRoutes(app: FastifyInstance) {
  // GET /api/agents — list with diffSummary computed from file_changes
  app.get("/api/agents", async () => {
    const rows = db.select().from(agents).all()
    return Promise.all(rows.map(async (a) => {
      const files = db.select().from(fileChanges).where(eq(fileChanges.agentId, a.id)).all()
      const additions = files.reduce((s, f) => s + f.additions, 0)
      const deletions = files.reduce((s, f) => s + f.deletions, 0)
      return {
        ...a,
        diffSummary: files.length > 0 ? { additions, deletions } : undefined,
      }
    }))
  })

  // GET /api/agents/:id — full agent with messages + files + terminal
  app.get<{ Params: { id: string } }>("/api/agents/:id", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    const msgs = db.select().from(messages)
      .where(eq(messages.agentId, agent.id))
      .all()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    const messagesWithTools = msgs.map((m) => {
      const tcs = db.select().from(toolCalls)
        .where(eq(toolCalls.messageId, m.id))
        .all()
        .sort((a, b) => a.orderIdx - b.orderIdx)
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

    const files = db.select().from(fileChanges).where(eq(fileChanges.agentId, agent.id)).all()
    const terminal = db.select().from(terminalLines)
      .where(eq(terminalLines.agentId, agent.id))
      .all()
      .map((t) => t.line)

    const additions = files.reduce((s, f) => s + f.additions, 0)
    const deletions = files.reduce((s, f) => s + f.deletions, 0)

    return {
      ...agent,
      messages: messagesWithTools,
      fileChanges: files,
      terminalOutput: terminal,
      diffSummary: files.length > 0 ? { additions, deletions } : undefined,
    }
  })

  // POST /api/agents — create agent + worktree
  app.post<{
    Body: {
      repoId?: string
      title: string
      branch: string
      model?: string
      location?: string
      description?: string
    }
  }>("/api/agents", async (req, reply) => {
    const { repoId, title, branch, model = "Sonnet 4.6", location, description } = req.body
    const now = new Date().toISOString()
    const id = uuid()
    const agentLocation = location ?? `workspace-${id.slice(0, 8)}`

    await db.insert(agents).values({
      id,
      repoId: repoId ?? null,
      title,
      status: "in-progress",
      branch,
      model,
      location: agentLocation,
      description: description ?? null,
      createdAt: now,
      updatedAt: now,
    })

    // If a repo is linked, create a git worktree
    if (repoId) {
      const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
      if (repo) {
        const worktreePath = path.join(repo.workspacesPath, agentLocation)
        try {
          await createWorktree(repo.path, branch, worktreePath)
        } catch (err) {
          app.log.warn(`Worktree creation failed: ${err}`)
        }
      }
    }

    const created = db.select().from(agents).where(eq(agents.id, id)).get()!
    broadcast({ type: "agent:updated", agent: created as any })
    reply.code(201)
    return created
  })

  // PATCH /api/agents/:id — update status / metadata
  app.patch<{
    Params: { id: string }
    Body: Partial<{ title: string; status: string; pr: string; description: string; unread: number }>
  }>("/api/agents/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body
    const now = new Date().toISOString()

    await db.update(agents).set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.pr !== undefined && { pr: body.pr }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.unread !== undefined && { unread: body.unread }),
      updatedAt: now,
    }).where(eq(agents.id, id))

    const updated = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!updated) return reply.code(404).send({ error: "Not found" })

    broadcast({ type: "agent:updated", agent: updated as any })
    return updated
  })

  // DELETE /api/agents/:id — archive + remove worktree
  app.delete<{ Params: { id: string } }>("/api/agents/:id", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    if (agent.repoId) {
      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (repo) {
        const worktreePath = path.join(repo.workspacesPath, agent.location)
        try {
          await removeWorktree(repo.path, worktreePath)
        } catch (err) {
          app.log.warn(`Worktree removal failed: ${err}`)
        }
      }
    }

    await db.delete(agents).where(eq(agents.id, req.params.id))
    reply.code(204).send()
  })

  // POST /api/agents/:id/sync-files — refresh file changes from git diff
  app.post<{ Params: { id: string } }>("/api/agents/:id/sync-files", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const worktreePath = path.join(repo.workspacesPath, agent.location)
    const summary = await getDiffSummary(worktreePath)

    return { diffSummary: summary }
  })
}
