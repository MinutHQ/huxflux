import { v4 as uuid } from "uuid"
import * as path from "node:path"
import { simpleGit } from "simple-git"
import { existsSync } from "node:fs"
import { db } from "../db/index.js"
import { repos, worktreePool } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { createWorktree, removeWorktree } from "./worktrees.js"

function poolLocation(): string {
  return `pool-${uuid().slice(0, 8)}`
}

function getPooledCount(repoId: string): number {
  return db.select().from(worktreePool).where(eq(worktreePool.repoId, repoId)).all().length
}

/**
 * Ensure the pool has enough pre-created worktrees for a repo.
 * Worktrees are synced to origin before being added to the pool.
 */
export async function replenishPool(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo || !repo.poolSize || repo.poolSize <= 0) return

  const currentCount = getPooledCount(repoId)
  const needed = repo.poolSize - currentCount
  if (needed <= 0) return

  console.log(`[pool] creating ${needed} worktree(s) for repo ${repo.name}`)

  // Fetch latest from origin so pool worktrees start fresh
  try {
    const git = simpleGit(repo.path)
    const branchFrom = repo.branchFrom ?? "origin/main"
    const remote = branchFrom.startsWith("origin/") ? branchFrom.replace(/^origin\//, "") : branchFrom
    await git.fetch(["--no-tags", "origin", remote])
  } catch (err) {
    console.warn(`[pool] fetch failed for ${repo.name}: ${(err as Error).message}`)
  }

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
            env: { ...process.env, NODE_ENV: "development", HUXFLUX_WORKTREE: worktreePath, HUXFLUX_REPO: repo.path },
          })
          proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
          proc.on("error", reject)
        })
      }

      db.insert(worktreePool).values({ id, repoId, location, branch, createdAt: now }).run()
      console.log(`[pool] created pooled worktree ${location} for repo ${repo.name}`)
    } catch (err) {
      console.error(`[pool] failed to create pooled worktree:`, err)
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
 * Claim a pre-created worktree from the pool for a new agent.
 * Renames the pool branch to the agent's branch.
 * Returns the claimed location, or null if pool is empty.
 */
export async function claimFromPool(
  repoId: string,
  agentBranch: string,
  baseBranch?: string,
): Promise<{ location: string } | null> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return null

  const entry = db.select().from(worktreePool).where(eq(worktreePool.repoId, repoId)).get()
  if (!entry) return null

  const worktreePath = path.join(repo.workspacesPath, entry.location)

  try {
    const git = simpleGit(worktreePath)

    // Rename the pool branch to the agent's actual branch
    await git.raw(["branch", "-m", entry.branch, agentBranch])

    // Reset to latest origin so the agent starts from a fresh base
    const base = baseBranch ?? repo.branchFrom ?? "origin/main"
    try {
      await git.raw(["reset", "--hard", base])
    } catch { /* base might not exist, worktree is already at the right point */ }
  } catch (err) {
    console.error(`[pool] failed to claim worktree ${entry.location}:`, err)
    // Remove the broken entry
    db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
    return null
  }

  // Remove from pool
  db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()

  // Replenish in the background
  replenishPool(repoId).catch((err) =>
    console.error(`[pool] replenish after claim failed:`, err)
  )

  console.log(`[pool] claimed worktree ${entry.location} for branch ${agentBranch}`)
  return { location: entry.location }
}

/**
 * Called when an agent is created (replenish pool in background).
 */
export function onAgentStarted(repoId: string): void {
  // Pool is replenished automatically after claim, but this handles
  // agents created without claiming (e.g. no pool configured)
  replenishPool(repoId).catch((err) =>
    console.error(`[pool] replenish after start failed:`, err)
  )
}

/**
 * Clean up pooled worktrees for a repo (when pool size is reduced to 0).
 */
export async function drainPool(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return

  const pooled = db.select().from(worktreePool).where(eq(worktreePool.repoId, repoId)).all()
  const keepCount = repo.poolSize ?? 0
  const toRemove = pooled.slice(keepCount)

  for (const entry of toRemove) {
    const worktreePath = path.join(repo.workspacesPath, entry.location)
    try {
      await removeWorktree(repo.path, worktreePath)
    } catch { /* already gone */ }
    db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
    console.log(`[pool] drained worktree ${entry.location}`)
  }
}
