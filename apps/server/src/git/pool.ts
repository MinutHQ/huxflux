import { v4 as uuid } from "uuid"
import * as path from "node:path"
import { simpleGit } from "simple-git"
import { existsSync } from "node:fs"
import { db } from "../db/index.js"
import { repos, agents } from "../db/schema.js"
import { eq, and, isNull } from "drizzle-orm"
import { createWorktree, removeWorktree } from "./worktrees.js"
import { broadcast } from "../ws/handler.js"
import { getSettings } from "../settings.js"

function poolLocation(): string {
  return `pool-${uuid().slice(0, 8)}`
}

/** Count backlog agents that are pooled (have no messages yet) for a repo */
function getPooledAgentCount(repoId: string): number {
  // Pooled agents: status=backlog, repoId matches, not deleted, not a child/task agent
  const rows = db.select().from(agents)
    .where(and(
      eq(agents.repoId, repoId),
      eq(agents.status, "backlog"),
      isNull(agents.deletedAt),
      isNull(agents.parentAgentId),
      isNull(agents.taskId),
    ))
    .all()
  return rows.length
}

/**
 * Ensure the pool has enough backlog agents for a repo.
 * Creates worktrees + agents up to the pool size limit.
 */
export async function replenishPool(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo || !repo.poolSize || repo.poolSize <= 0) return

  const currentCount = getPooledAgentCount(repoId)
  const needed = repo.poolSize - currentCount
  if (needed <= 0) return

  const settings = getSettings()
  const defaultModel = settings.defaultModel ?? "claude-sonnet-4-6"

  console.log(`[pool] creating ${needed} agent(s) for repo ${repo.name}`)

  for (let i = 0; i < needed; i++) {
    const id = uuid()
    const location = poolLocation()
    const worktreePath = path.join(repo.workspacesPath, location)
    const branch = `pool/${location}`
    const now = new Date().toISOString()

    try {
      await createWorktree(repo.path, branch, worktreePath, repo.branchFrom)

      // Run setup script if configured
      if (repo.setupScript) {
        const { spawn } = await import("node:child_process")
        await new Promise<void>((resolve, reject) => {
          const proc = spawn("sh", ["-c", repo.setupScript!], {
            cwd: worktreePath,
            stdio: "ignore",
            env: { ...process.env, NODE_ENV: "development", HUXFLUX_WORKTREE: worktreePath, HUXFLUX_REPO: repo.path, HUXFLUX_AGENT_ID: id },
          })
          proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
          proc.on("error", reject)
        })
      }

      db.insert(agents).values({
        id,
        repoId,
        title: "Ready",
        status: "backlog",
        branch,
        baseBranch: repo.branchFrom,
        model: defaultModel,
        location,
        createdAt: now,
        updatedAt: now,
      }).run()

      const created = db.select().from(agents).where(eq(agents.id, id)).get()
      if (created) broadcast({ type: "agent:updated", agent: created as any })

      console.log(`[pool] created pooled agent ${id} (${location}) for repo ${repo.name}`)
    } catch (err) {
      console.error(`[pool] failed to create pooled agent:`, err)
    }
  }
}

/**
 * Initialize pools for all repos that have poolSize > 0.
 * Called on server startup.
 */
export async function initializePools(): Promise<void> {
  const poolRepos = db.select().from(repos).all().filter((r) => r.poolSize && r.poolSize > 0)
  for (const repo of poolRepos) {
    await replenishPool(repo.id).catch((err) =>
      console.error(`[pool] init failed for ${repo.name}:`, err)
    )
  }
}

/**
 * Called when an agent moves from backlog to in-progress.
 * Replenishes the pool in the background.
 */
export function onAgentStarted(repoId: string): void {
  replenishPool(repoId).catch((err) =>
    console.error(`[pool] replenish after start failed:`, err)
  )
}

/**
 * Clean up pooled backlog agents for a repo (when pool size is reduced to 0).
 */
export async function drainPool(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return

  const pooled = db.select().from(agents)
    .where(and(
      eq(agents.repoId, repoId),
      eq(agents.status, "backlog"),
      isNull(agents.deletedAt),
      isNull(agents.parentAgentId),
      isNull(agents.taskId),
    ))
    .all()

  const keepCount = repo.poolSize ?? 0
  const toRemove = pooled.slice(keepCount)

  for (const agent of toRemove) {
    const worktreePath = path.join(repo.workspacesPath, agent.location)
    try {
      await removeWorktree(repo.path, worktreePath)
    } catch { /* already gone */ }
    db.update(agents).set({ deletedAt: new Date().toISOString() }).where(eq(agents.id, agent.id)).run()
    broadcast({ type: "agent:deleted", agentId: agent.id })
  }
}
