import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, fileChanges, terminalLines, repos } from "../db/schema.js"
import { createWorktree, removeWorktree, getDiffSummary } from "../git/worktrees.js"
import { broadcast } from "../ws/handler.js"
import { stopAgent } from "../claude/runner.js"
import { parsePrStatus } from "../github/prStatus.js"
import { config } from "../config.js"
import * as path from "node:path"
import { spawn } from "node:child_process"

function runScript(script: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sh", ["-c", script], { cwd, stdio: "inherit" })
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Setup script exited with code ${code}`)))
    proc.on("error", reject)
  })
}

export async function agentsRoutes(app: FastifyInstance) {
  // GET /api/agents — list with diffSummary computed from file_changes (excludes child tabs)
  app.get("/api/agents", async () => {
    const rows = db.select().from(agents).all().filter((a) => !a.parentAgentId)
    return Promise.all(rows.map(async (a) => {
      const files = db.select().from(fileChanges).where(eq(fileChanges.agentId, a.id)).all()
      const additions = files.reduce((s, f) => s + f.additions, 0)
      const deletions = files.reduce((s, f) => s + f.deletions, 0)
      return {
        ...a,
        diffSummary: files.length > 0 ? { additions, deletions } : undefined,
        prStatus: parsePrStatus(a.prStatus),
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

    const messagesWithTools = msgs.map((m) => {
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
      prStatus: parsePrStatus(agent.prStatus),
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
      shareWorktreeWith?: string // agent ID to share worktree with
    }
  }>("/api/agents", async (req, reply) => {
    const { repoId, title, branch, model = "Sonnet 4.6", location, description, shareWorktreeWith } = req.body
    const now = new Date().toISOString()
    const id = uuid()

    // If sharing a worktree, reuse the existing agent's location
    let agentLocation = location ?? `workspace-${id.slice(0, 8)}`
    let agentRepoId = repoId ?? null
    let skipWorktreeCreation = false

    if (shareWorktreeWith) {
      const sourceAgent = db.select().from(agents).where(eq(agents.id, shareWorktreeWith)).get()
      if (sourceAgent) {
        agentLocation = sourceAgent.location
        agentRepoId = sourceAgent.repoId ?? agentRepoId
        skipWorktreeCreation = true
      }
    }

    await db.insert(agents).values({
      id,
      repoId: agentRepoId,
      title,
      status: "in-progress",
      branch,
      model,
      location: agentLocation,
      description: description ?? null,
      parentAgentId: shareWorktreeWith ?? null,
      createdAt: now,
      updatedAt: now,
    })

    // If a repo is linked and not sharing an existing worktree, create a git worktree
    if (agentRepoId && !skipWorktreeCreation) {
      const repo = db.select().from(repos).where(eq(repos.id, agentRepoId)).get()
      if (repo) {
        const worktreePath = path.join(repo.workspacesPath, agentLocation)
        try {
          await createWorktree(repo.path, branch, worktreePath, repo.branchFrom)
        } catch (err) {
          app.log.warn(`Worktree creation failed: ${err}`)
        }
        if (repo.setupScript) {
          try {
            await runScript(repo.setupScript, worktreePath)
          } catch (err) {
            app.log.warn(`Setup script failed: ${err}`)
          }
        }
      }
    }

    const created = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!created) return reply.code(500).send({ error: "Failed to create agent" })
    broadcast({ type: "agent:updated", agent: created as any })
    reply.code(201)
    return created
  })

  // PATCH /api/agents/:id — update status / metadata
  app.patch<{
    Params: { id: string }
    Body: Partial<{ title: string; status: string; branch: string; pr: string; description: string; unread: number; baseBranch: string }>
  }>("/api/agents/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body
    const now = new Date().toISOString()

    await db.update(agents).set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.branch !== undefined && { branch: body.branch }),
      ...(body.pr !== undefined && { pr: body.pr }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.unread !== undefined && { unread: body.unread }),
      ...(body.baseBranch !== undefined && { baseBranch: body.baseBranch }),
      updatedAt: now,
    }).where(eq(agents.id, id))

    const updated = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!updated) return reply.code(404).send({ error: "Not found" })

    broadcast({ type: "agent:updated", agent: updated as any })
    return updated
  })

  // POST /api/agents/:id/stop — kill the running Claude process
  app.post<{ Params: { id: string } }>("/api/agents/:id/stop", async (req, reply) => {
    const killed = stopAgent(req.params.id)
    if (!killed) return reply.code(404).send({ error: "No running process for this agent" })
    return { stopped: true }
  })

  // DELETE /api/agents/:id — archive + remove worktree
  app.delete<{ Params: { id: string } }>("/api/agents/:id", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    // Delete child tabs first (before worktree removal, since children share the worktree)
    const children = db.select().from(agents).where(eq(agents.parentAgentId, req.params.id)).all()
    for (const child of children) {
      await db.delete(agents).where(eq(agents.id, child.id))
    }

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
    const summary = await getDiffSummary(worktreePath, repo.branchFrom)

    return { diffSummary: summary }
  })
}
