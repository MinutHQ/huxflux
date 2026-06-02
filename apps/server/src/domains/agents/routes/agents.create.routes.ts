import type { FastifyInstance } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { v4 as uuid } from "uuid"
import { eq, isNull, and } from "drizzle-orm"
import { createAgentBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, terminalTabs, repos } from "../../../db/schema.js"
import { createWorktree } from "../../git/worktrees.js"
import { claimReserve } from "../../git/pool.js"
import { watchWorktree } from "../../git/watcher.js"
import { agentsWs } from "../agents.ws.js"
import { findPRForBranch } from "../../pull-requests/prStatus.js"
import { getSettings } from "../../settings/settings.service.js"
import { config } from "../../../config.js"
import { runSetupScript } from "../service/setupScript.js"
import type { AgentSummary } from "../../../types.js"
import * as path from "node:path"
import { existsSync } from "node:fs"
import { simpleGit } from "simple-git"

export const agentsCreateRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/agents — create agent + worktree
  app.post("/api/agents", {
    schema: { body: createAgentBodySchema },
  }, async (req, reply) => {
    const {
      repoId, title, branch,
      model = getSettings().defaultModel ?? "Sonnet 4.6",
      location, description, shareWorktreeWith, noWorktree, existingBranch, baseBranch,
      provider = getSettings().defaultProvider ?? "claude",
    } = req.body
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

    // Resolve location collisions — if the name is already taken (in DB or on disk),
    // append an incrementing suffix: workspace-abc → workspace-abc-2 → workspace-abc-3
    if (!skipWorktreeCreation) {
      agentLocation = resolveLocationCollision(agentLocation, agentRepoId)
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
      noWorktree: noWorktree ? 1 : null,
      baseBranch: baseBranch ?? null,
      provider,
      createdAt: now,
      updatedAt: now,
    })

    // If a repo is linked and not sharing an existing worktree, create a git worktree
    if (agentRepoId && !skipWorktreeCreation && !noWorktree) {
      const t0 = Date.now()
      const setupResult = await setupRepoWorktree({ app, id, agentRepoId, agentLocation, branch, baseBranch })
      console.info(`[create] setupRepoWorktree ${Date.now() - t0}ms (agent ${id.slice(0, 8)})`)
      if (!setupResult.ok) return reply.code(setupResult.status).send({ error: setupResult.error })
      agentLocation = setupResult.location
    }

    const created = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!created) return reply.code(500).send({ error: "Failed to create agent" })

    // Start live file watcher for the new worktree
    if (agentRepoId && !skipWorktreeCreation && !noWorktree) {
      const repo = db.select().from(repos).where(eq(repos.id, agentRepoId)).get()
      if (repo) {
        const worktreePath = path.join(repo.workspacesPath, agentLocation)
        watchWorktree(id, worktreePath, baseBranch ?? repo.branchFrom)
      }
    }

    // Auto-create the default t1 terminal tab for root agents (not child sessions)
    if (!shareWorktreeWith) {
      db.insert(terminalTabs).values({
        id: uuid(),
        agentId: id,
        terminalId: "t1",
        label: null,
        orderIdx: 0,
      }).run()
    }

    // Auto-link PR when picking an existing branch (fire-and-forget)
    if (existingBranch && agentRepoId && config.githubToken) {
      void autoLinkPR(id, agentRepoId, branch)
    }

    agentsWs.agentUpdated(created as unknown as AgentSummary)
    reply.code(201)
    return created
  })
}

function resolveLocationCollision(agentLocation: string, agentRepoId: string | null): string {
  const repo = agentRepoId ? db.select().from(repos).where(eq(repos.id, agentRepoId)).get() : null
  const base = agentLocation
  let suffix = 2
  let candidate = agentLocation
  while (true) {
    const takenInDb = db.select({ id: agents.id }).from(agents)
      .where(and(eq(agents.location, candidate), isNull(agents.deletedAt)))
      .get()
    const takenOnDisk = repo ? existsSync(path.join(repo.workspacesPath, candidate)) : false
    if (!takenInDb && !takenOnDisk) return candidate
    candidate = `${base}-${suffix++}`
  }
}

interface SetupResult {
  ok: boolean
  status: number
  location: string
  error?: string
}

interface SetupArgs {
  app: FastifyInstance
  id: string
  agentRepoId: string
  agentLocation: string
  branch: string
  baseBranch?: string
}

async function setupRepoWorktree({ app, id, agentRepoId, agentLocation, branch, baseBranch }: SetupArgs): Promise<SetupResult> {
  const repo = db.select().from(repos).where(eq(repos.id, agentRepoId)).get()
  if (!repo) return { ok: true, status: 200, location: agentLocation }

  if (!existsSync(repo.path)) {
    await db.delete(agents).where(eq(agents.id, id))
    return { ok: false, status: 400, location: agentLocation, error: `Repo path does not exist on disk: ${repo.path}` }
  }

  // Try to claim the hidden reserve worktree
  const claimed = await claimReserve(agentRepoId, branch, baseBranch ?? repo.branchFrom)
  if (claimed) {
    db.update(agents).set({ location: claimed.location }).where(eq(agents.id, id)).run()
    return { ok: true, status: 200, location: claimed.location }
  }
  const worktreePath = path.join(repo.workspacesPath, agentLocation)
  try {
    await createWorktree(repo.path, branch, worktreePath, baseBranch ?? repo.branchFrom)
  } catch (err) {
    app.log.error(`Failed to create worktree for agent ${id}: ${err}`)
    await db.delete(agents).where(eq(agents.id, id))
    return { ok: false, status: 500, location: agentLocation, error: `Failed to create worktree: ${(err as Error).message}` }
  }
  if (repo.setupScript) {
    try {
      await runSetupScript(repo.setupScript, worktreePath, id, repo.path)
    } catch (err) {
      app.log.warn(`Setup script failed: ${err}`)
    }
  }
  return { ok: true, status: 200, location: agentLocation }
}

async function autoLinkPR(id: string, agentRepoId: string, branch: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, agentRepoId)).get()
  if (!repo?.previewUrl && !repo?.path) return
  // Derive remote URL from git config
  try {
    const remoteUrl = await simpleGit(repo!.path).remote(["get-url", "origin"])
    const url = (remoteUrl ?? "").trim()
    if (!url) return
    const pr = await findPRForBranch(url, branch).catch(() => null)
    if (!pr) return
    db.update(agents).set({
      pr: pr.url,
      prNumber: pr.number,
      prStatus: JSON.stringify(pr),
    }).where(eq(agents.id, id)).run()
    const updated = db.select().from(agents).where(eq(agents.id, id)).get()
    if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
  } catch { /* best-effort */ }
}
