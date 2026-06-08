import { v4 as uuid } from "uuid"
import * as path from "node:path"
import * as fs from "node:fs"
import { simpleGit } from "simple-git"
import { db } from "../../db/index.js"
import { repos, worktreePool } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import { createWorktree, removeWorktree } from "./worktrees.js"

/**
 * The "reserve" is a single hidden worktree per repo. When the repo has a
 * setup script, the script is run ahead of time so claiming the reserve
 * skips the install. When the repo has no setup script, the reserve still
 * exists — claiming it saves the cold-path `git fetch` + `worktree add`,
 * which is the largest single cost on a fresh `createAgent` for any
 * non-trivial repo. Storage lives in the legacy `worktree_pool` table — at
 * most one row per repo.
 */

function reserveLocation(): string {
  return `pool-${uuid().slice(0, 8)}`
}

function getReserveCount(repoId: string): number {
  return db.select().from(worktreePool).where(eq(worktreePool.repoId, repoId)).all().length
}

async function fetchBase(repoPath: string, branchFrom: string | null | undefined): Promise<void> {
  const base = branchFrom ?? "origin/main"
  const remote = base.startsWith("origin/") ? base.replace(/^origin\//, "") : base
  try {
    await simpleGit(repoPath).fetch(["--no-tags", "origin", remote])
  } catch (err) {
    // First line only — git/SSH error output (host-key art etc.) is noisy.
    const msg = String((err as Error).message ?? err).split("\n")[0]
    console.warn(`[reserve] fetch skipped: ${msg}`)
  }
}

/**
 * Ensure a single hidden reserve worktree exists for this repo.
 * No-op if a reserve already exists, or if the repo is folder-typed (no
 * git remote, no worktree concept). Builds the worktree regardless of
 * whether the repo has a setup script — the cold-path git work is the
 * dominant cost on a fresh agent create, so warming it ahead of time helps
 * every repo. The setup script, if any, runs after the worktree exists.
 */
export async function ensureReserve(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return
  if (repo.type === "folder") return
  if (!fs.existsSync(repo.path)) return
  if (getReserveCount(repoId) >= 1) return

  await fetchBase(repo.path, repo.branchFrom)

  const id = uuid()
  const location = reserveLocation()
  const worktreePath = path.join(repo.workspacesPath, location)
  const branch = `pool/${location}`
  const now = new Date().toISOString()

  try {
    await createWorktree(repo.path, branch, worktreePath, repo.branchFrom)

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
    console.info(`[reserve] created ${location} for repo ${repo.name}`)
  } catch (err) {
    console.error(`[reserve] failed to create worktree:`, err)
  }
}

/**
 * Claim the hidden reserve for a new agent. Fetches the base branch first
 * so the agent starts from up-to-date code, renames the reserve branch to
 * the agent's branch, resets to the latest base, and triggers a background
 * refill. Returns null if no reserve is available.
 */
export async function claimReserve(
  repoId: string,
  agentBranch: string,
  baseBranch?: string,
): Promise<{ location: string } | null> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return null

  const entry = db.select().from(worktreePool).where(eq(worktreePool.repoId, repoId)).get()
  if (!entry) return null

  const worktreePath = path.join(repo.workspacesPath, entry.location)
  const base = baseBranch ?? repo.branchFrom ?? "origin/main"

  // Fetch the base so the agent gets the latest upstream
  await fetchBase(repo.path, base)

  try {
    const git = simpleGit(worktreePath)
    await git.raw(["branch", "-m", entry.branch, agentBranch])
    try {
      await git.raw(["reset", "--hard", base])
    } catch { /* base might not exist, worktree is already at the right point */ }
  } catch (err) {
    console.error(`[reserve] failed to claim ${entry.location}:`, err)
    db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
    return null
  }

  db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()

  // Refill in the background
  ensureReserve(repoId).catch((err) =>
    console.error(`[reserve] refill after claim failed:`, err)
  )

  console.info(`[reserve] claimed ${entry.location} for branch ${agentBranch}`)
  return { location: entry.location }
}

/**
 * Remove the reserve for a repo. Called when a repo loses its setup
 * script, so we don't keep a now-pointless worktree around.
 */
export async function drainReserves(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return

  const entries = db.select().from(worktreePool).where(eq(worktreePool.repoId, repoId)).all()
  for (const entry of entries) {
    const worktreePath = path.join(repo.workspacesPath, entry.location)
    try {
      await removeWorktree(repo.path, worktreePath)
    } catch { /* already gone */ }
    db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
    console.info(`[reserve] removed ${entry.location} for repo ${repo.name}`)
  }
}

/**
 * On server startup: drain any stale extras from earlier pool-size > 1
 * configurations, then ensure exactly one reserve exists for every repo.
 * Reserves are built regardless of whether the repo has a setup script,
 * since the cold-path git fetch + worktree add is what dominates the
 * agent-create response time.
 */
export async function initializeReserves(): Promise<void> {
  const allRepos = db.select().from(repos).all()
  for (const repo of allRepos) {
    const entries = db.select().from(worktreePool).where(eq(worktreePool.repoId, repo.id)).all()

    // Trim to a single reserve
    const extras = entries.slice(1)
    for (const entry of extras) {
      const worktreePath = path.join(repo.workspacesPath, entry.location)
      try { await removeWorktree(repo.path, worktreePath) } catch { /* gone */ }
      db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
    }

    await ensureReserve(repo.id).catch((err) =>
      console.error(`[reserve] init failed for ${repo.name}:`, err)
    )
  }
}
