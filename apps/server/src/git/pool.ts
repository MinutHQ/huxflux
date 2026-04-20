import { v4 as uuid } from "uuid"
import * as path from "node:path"
import { simpleGit } from "simple-git"
import { existsSync } from "node:fs"
import { db } from "../db/index.js"
import { repos, worktreePool } from "../db/schema.js"
import { eq, and } from "drizzle-orm"
import { createWorktree, removeWorktree } from "./worktrees.js"

function poolLocation(): string {
  return `pool-${uuid().slice(0, 8)}`
}

/**
 * Claim a worktree from the pool for a new agent.
 * Returns the worktree location (relative to workspacesPath), or null if pool is empty.
 * After claiming, a background task replenishes the pool.
 */
export async function claimPooledWorktree(
  repoId: string,
  targetBranch: string,
  baseBranch: string
): Promise<{ location: string; worktreePath: string } | null> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo || !repo.poolSize || repo.poolSize <= 0) return null

  // Find an available pooled worktree
  const pooled = db.select().from(worktreePool)
    .where(eq(worktreePool.repoId, repoId))
    .all()

  if (pooled.length === 0) return null

  // Claim the first one
  const claimed = pooled[0]
  const worktreePath = path.join(repo.workspacesPath, claimed.location)

  // Verify it exists on disk
  if (!existsSync(worktreePath)) {
    db.delete(worktreePool).where(eq(worktreePool.id, claimed.id)).run()
    return null
  }

  // Update the worktree to the target branch and make it fresh
  try {
    const git = simpleGit(worktreePath)
    // Fetch latest
    await git.fetch(["--no-tags", "origin"]).catch(() => {})
    // Create and checkout the target branch from the base
    await git.raw(["checkout", "-B", targetBranch, baseBranch]).catch(async () => {
      // If baseBranch doesn't resolve, try without it
      await git.raw(["checkout", "-B", targetBranch])
    })
  } catch (err) {
    console.error(`[pool] failed to prepare pooled worktree ${claimed.location}:`, err)
    db.delete(worktreePool).where(eq(worktreePool.id, claimed.id)).run()
    return null
  }

  // Remove from pool
  db.delete(worktreePool).where(eq(worktreePool.id, claimed.id)).run()

  // Replenish in background
  replenishPool(repoId).catch((err) =>
    console.error(`[pool] replenish failed for repo ${repoId}:`, err)
  )

  return { location: claimed.location, worktreePath }
}

/**
 * Ensure the pool has enough worktrees for a repo.
 * Creates worktrees up to the pool size limit.
 */
export async function replenishPool(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo || !repo.poolSize || repo.poolSize <= 0) return

  const current = db.select().from(worktreePool)
    .where(eq(worktreePool.repoId, repoId))
    .all()

  const needed = repo.poolSize - current.length
  if (needed <= 0) return

  console.log(`[pool] creating ${needed} worktree(s) for repo ${repo.name}`)

  for (let i = 0; i < needed; i++) {
    const location = poolLocation()
    const worktreePath = path.join(repo.workspacesPath, location)
    // Use a temporary branch name — it will be replaced when claimed
    const tempBranch = `pool/${location}`

    try {
      await createWorktree(repo.path, tempBranch, worktreePath, repo.branchFrom)

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

      db.insert(worktreePool).values({
        id: uuid(),
        repoId,
        location,
        branch: tempBranch,
        createdAt: new Date().toISOString(),
      }).run()

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
 * Clean up pool worktrees for a repo (e.g. when pool size is reduced to 0).
 */
export async function drainPool(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return

  const pooled = db.select().from(worktreePool)
    .where(eq(worktreePool.repoId, repoId))
    .all()

  for (const p of pooled) {
    const worktreePath = path.join(repo.workspacesPath, p.location)
    try {
      await removeWorktree(repo.path, worktreePath)
    } catch { /* already gone */ }
    db.delete(worktreePool).where(eq(worktreePool.id, p.id)).run()
  }
}
