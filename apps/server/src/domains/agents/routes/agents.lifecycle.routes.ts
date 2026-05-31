import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq, isNull, and } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents, repos } from "../../../db/schema.js"
import { removeWorktree, getDiffSummary } from "../../git/worktrees.js"
import { unwatchWorktree } from "../../git/watcher.js"
import { killWorktreeProcesses } from "../../git/processes.js"
import { agentsWs } from "../agents.ws.js"
import { killAgentTerminals } from "../../ws/pty.js"
import * as path from "node:path"

const idParamsSchema = z.object({ id: z.string() })

export const agentsLifecycleRoutes: FastifyPluginAsyncZod = async (app) => {
  // DELETE /api/agents/:id — soft delete: marks deleted_at, removes worktree, never hard-deletes DB rows
  app.delete("/api/agents/:id", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const agent = db.select().from(agents).where(and(eq(agents.id, req.params.id), isNull(agents.deletedAt))).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    const now = new Date().toISOString()

    // Kill all PTY processes for this agent and its children
    killAgentTerminals(req.params.id)
    const childRows = db.select({ id: agents.id }).from(agents)
      .where(eq(agents.parentAgentId, req.params.id))
      .all()
    for (const child of childRows) {
      killAgentTerminals(child.id)
    }

    // Soft-delete child tabs too
    await db.update(agents)
      .set({ deletedAt: now })
      .where(eq(agents.parentAgentId, req.params.id))

    // Stop live file watcher before removing worktree
    unwatchWorktree(req.params.id)

    // Remove worktree from disk (frees space) but keep DB record
    // Skip for child agents — they share the parent's worktree
    if (agent.repoId && !agent.noWorktree && !agent.parentAgentId) {
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

    await db.update(agents).set({ deletedAt: now }).where(eq(agents.id, req.params.id))
    agentsWs.agentDeleted(req.params.id)
    reply.code(204).send()
  })

  // POST /api/agents/:id/sync-files — refresh file changes from git diff
  app.post("/api/agents/:id/sync-files", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const worktreePath = path.join(repo.workspacesPath, agent.location)
    const summary = await getDiffSummary(worktreePath, agent.baseBranch ?? repo.branchFrom)

    return { diffSummary: summary }
  })

  // POST /api/agents/:id/kill-processes — kill processes in a worktree (async)
  app.post("/api/agents/:id/kill-processes", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found" })
    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })
    const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
    return await killWorktreeProcesses(worktreePath)
  })
}
