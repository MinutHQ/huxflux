import type { FastifyInstance } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { updateAgentBodySchema, type UpdateAgentBody } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, repos } from "../../../db/schema.js"
import { refreshWorktree } from "../../git/watcher.js"
import { killWorktreeProcesses, clearAgentPorts } from "../../git/processes.js"
import { agentsWs } from "../agents.ws.js"
import { getSettings } from "../../settings/settings.service.js"
import type { AgentSummary } from "../../../types.js"
import * as path from "node:path"
import { simpleGit } from "simple-git"

type UpdateBody = UpdateAgentBody

const idParamsSchema = z.object({ id: z.string() })

export const agentsUpdateRoutes: FastifyPluginAsyncZod = async (app) => {
  // PATCH /api/agents/:id — update status / metadata
  app.patch("/api/agents/:id", {
    schema: { params: idParamsSchema, body: updateAgentBodySchema },
  }, async (req, reply) => {
    const { id } = req.params
    const body = req.body
    const now = new Date().toISOString()

    // Read old state before update (needed for rebase --onto)
    const oldAgent = body.baseBranch !== undefined
      ? db.select().from(agents).where(eq(agents.id, id)).get()
      : null

    await db.update(agents).set(buildPatch(body, now)).where(eq(agents.id, id))

    const updated = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!updated) return reply.code(404).send({ error: "Not found" })

    // Rebase onto new base branch when baseBranch changes
    if (body.baseBranch !== undefined && updated.repoId && oldAgent) {
      await rebaseOntoNewBase(app, id, body.baseBranch, oldAgent, updated)
    }

    // Auto-kill processes when agent moves to done/cancelled
    if (body.status && (body.status === "done" || body.status === "cancelled") && updated.repoId) {
      await autoKillProcesses(app, id, updated)
    }

    agentsWs.agentUpdated(updated as unknown as AgentSummary)
    return updated
  })
}

function buildPatch(body: UpdateBody, now: string): Record<string, unknown> {
  return {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.branch !== undefined && { branch: body.branch }),
    ...(body.pr !== undefined && { pr: body.pr }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.unread !== undefined && { unread: body.unread }),
    ...(body.model !== undefined && { model: body.model }),
    ...(body.provider !== undefined && { provider: body.provider }),
    ...(body.baseBranch !== undefined && { baseBranch: body.baseBranch }),
    ...(body.draft !== undefined && { draft: body.draft }),
    ...(body.prCommentMonitoring !== undefined && { prCommentMonitoring: body.prCommentMonitoring === null ? null : body.prCommentMonitoring ? 1 : 0 }),
    ...(body.ciMonitoring !== undefined && { ciMonitoring: body.ciMonitoring === null ? null : body.ciMonitoring ? 1 : 0 }),
    ...(body.pinned !== undefined && { pinned: body.pinned ? 1 : 0 }),
    updatedAt: now,
  }
}

async function rebaseOntoNewBase(
  app: FastifyInstance,
  id: string,
  newBaseRaw: string,
  oldAgent: typeof agents.$inferSelect,
  updated: typeof agents.$inferSelect,
): Promise<void> {
  if (!updated.repoId) return
  const repo = db.select().from(repos).where(eq(repos.id, updated.repoId)).get()
  if (!repo) return
  const worktreePath = updated.noWorktree ? repo.path : path.join(repo.workspacesPath, updated.location)
  const oldBaseRaw = oldAgent.baseBranch ?? repo.branchFrom
  const git = simpleGit(worktreePath)
  try {
    // Check if remote exists before trying to fetch
    const hasRemote = await git.remote([]).then((r) => !!r?.trim()).catch(() => false)
    if (hasRemote) await git.fetch("origin").catch(() => {})
    const resolveRef = async (ref: string): Promise<string> => {
      if (ref.startsWith("origin/")) return ref
      if (hasRemote) {
        const remoteRef = `origin/${ref}`
        const exists = await git.raw(["rev-parse", "--verify", remoteRef]).then(() => true).catch(() => false)
        if (exists) return remoteRef
      }
      return ref
    }
    const newBase = await resolveRef(newBaseRaw)
    // Resolve oldBase as well so we surface any lookup errors before the rebase
    // attempts; the value itself isn't used here (preserved from source intent).
    await resolveRef(oldBaseRaw)
    // Count commits only on this branch (not on any remote) = agent's own work
    const agentCommits = await git.raw(["rev-list", "--count", "HEAD", "--not", "--remotes"]).then((s) => parseInt(s.trim(), 10)).catch(() => 0)
    if (agentCommits > 0) {
      // Rebase the agent's N commits onto the new base
      await git.rebase(["--onto", newBase, `HEAD~${agentCommits}`])
    } else {
      await git.raw(["reset", "--hard", newBase])
    }
    void refreshWorktree(id, worktreePath, newBaseRaw)
  } catch (err) {
    try { await git.rebase(["--abort"]) } catch { /* already clean */ }
    app.log.error(`Rebase onto ${newBaseRaw} failed for agent ${id}: ${(err as Error).message}`)
  }
}

async function autoKillProcesses(
  app: FastifyInstance,
  id: string,
  updated: typeof agents.$inferSelect,
): Promise<void> {
  const settings = getSettings()
  if (!settings.killProcessesOnDone) return
  if (!updated.repoId) return
  const repo = db.select().from(repos).where(eq(repos.id, updated.repoId)).get()
  if (!repo || updated.noWorktree) return
  const worktreePath = path.join(repo.workspacesPath, updated.location)
  try {
    const result = await killWorktreeProcesses(worktreePath)
    clearAgentPorts(id)
    if (result.killed > 0) {
      app.log.info(`[auto-kill] killed ${result.killed} process(es) in ${updated.location}`)
    }
  } catch (err) {
    app.log.warn(`[auto-kill] failed for ${updated.location}: ${err}`)
  }
}
