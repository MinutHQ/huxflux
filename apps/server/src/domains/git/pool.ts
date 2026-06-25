import { v4 as uuid } from "uuid"
import * as path from "node:path"
import * as fs from "node:fs"
import { simpleGit } from "simple-git"
import { db } from "../../db/index.js"
import { repos, worktreePool } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import { createWorktree, removeWorktree } from "./worktrees.js"
import { logger } from "../../logger.js"

/**
 * The "reserve" is one or more hidden pre-warmed worktrees per repo. Claiming a
 * reserve lets `createAgent` skip the cold-path `git fetch` + `worktree add`
 * (and, when the repo has a setup script, the install/build that the script
 * runs ahead of time) — which is the dominant cost on a fresh agent create for
 * any non-trivial repo. Storage lives in the `worktree_pool` table.
 *
 * Depth is auto-derived from repo weight: a repo with a setup script rebuilds
 * slowly (install + build per worktree), so we keep a deeper pool to absorb
 * bursts of agent creation; everything else keeps a single reserve.
 */

type RepoRow = typeof repos.$inferSelect

/**
 * How many reserves to keep warm for a "heavy" repo — one whose worktrees are
 * expensive to create. The extra standing worktrees cost disk and build time,
 * so they only pay off when creation is both slow and bursty. Lighter repos
 * (no setup script) keep a single reserve.
 */
export const HEAVY_RESERVE_COUNT = 3

/** Desired number of warm reserves for a repo, derived from its weight. */
function reserveTarget(repo: RepoRow): number {
  return repo.setupScript ? HEAVY_RESERVE_COUNT : 1
}

/** Repos currently being topped up, so concurrent calls don't over-build. */
const ensuring = new Set<string>()

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
    logger.warn(`[reserve] fetch skipped: ${msg}`)
  }
}

/** Build a single reserve worktree (and run the setup script, if any). Returns
 * whether the reserve was created and recorded. */
async function buildOneReserve(repo: RepoRow): Promise<boolean> {
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

    db.insert(worktreePool).values({ id, repoId: repo.id, location, branch, createdAt: now }).run()
    logger.info(`[reserve] created ${location} for repo ${repo.name}`)
    return true
  } catch (err) {
    // Roll back a partially-built reserve (e.g. worktree created but the setup
    // script failed) so we don't leave an orphan on disk — orphan accumulation
    // is exactly what this pool exists to avoid.
    try {
      await removeWorktree(repo.path, worktreePath)
      await simpleGit(repo.path).raw(["branch", "-D", branch]).catch(() => {})
    } catch { /* nothing to clean up */ }
    logger.error({ err }, `[reserve] failed to build reserve ${location}`)
    return false
  }
}

/**
 * Ensure a repo has its target number of warm reserves. No-op for folder-typed
 * repos (no git remote, no worktree concept) and for repos that already meet
 * their target. Builds reserves one at a time, stopping early if a build fails
 * so a persistently-failing repo does not spin. Concurrent calls for the same
 * repo are coalesced via an in-flight guard.
 */
export async function ensureReserve(repoId: string): Promise<void> {
  const repo = db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo) return
  if (repo.type === "folder") return
  if (!fs.existsSync(repo.path)) return

  if (getReserveCount(repoId) >= reserveTarget(repo)) return
  if (ensuring.has(repoId)) return

  ensuring.add(repoId)
  try {
    await fetchBase(repo.path, repo.branchFrom)
    // Re-read the repo each iteration: a build is slow for heavy repos, and the
    // setup script (and thus the target) can change mid-loop, or a concurrent
    // drainReserves can lower the count. Building from a fresh snapshot keeps a
    // stale-settings reserve from being persisted.
    while (true) {
      const current = db.select().from(repos).where(eq(repos.id, repoId)).get()
      if (!current) break
      if (getReserveCount(repoId) >= reserveTarget(current)) break
      const built = await buildOneReserve(current)
      if (!built) break
    }
  } finally {
    ensuring.delete(repoId)
  }
}

/**
 * Claim a reserve for a new agent. Fetches the base branch first so the agent
 * starts from up-to-date code, renames the reserve branch to the agent's
 * branch, resets to the latest base, and triggers a background refill. Returns
 * null if no reserve is available.
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
    logger.error({ err }, `[reserve] failed to claim ${entry.location}`)
    db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
    return null
  }

  db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()

  // Refill in the background
  ensureReserve(repoId).catch((err) =>
    logger.error({ err }, `[reserve] refill after claim failed`)
  )

  logger.info(`[reserve] claimed ${entry.location} for branch ${agentBranch}`)
  return { location: entry.location }
}

/**
 * Remove every reserve for a repo. Called when the setup script changes (so the
 * next reserve is rebuilt fresh) or when a repo is deleted.
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
    logger.info(`[reserve] removed ${entry.location} for repo ${repo.name}`)
  }
}

interface WorktreeEntry {
  path: string
  branch?: string
}

/** Parse `git worktree list --porcelain` into one entry per worktree. */
function parseWorktreePorcelain(out: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: WorktreeEntry | null = null
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current)
      current = { path: line.slice("worktree ".length).trim() }
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "")
    }
  }
  if (current) entries.push(current)
  return entries
}

/**
 * Remove orphaned reserve worktrees: `pool/pool-*` branches that exist on disk
 * but the DB no longer tracks. These are left behind when a reserve build is
 * interrupted before its row is written (the worktree was created, the row
 * never landed). Claimed reserves are safe — claiming renames the branch to the
 * agent branch, so a still-`pool/pool-*` branch is always an unclaimed reserve.
 */
async function removeOrphanReserves(repo: RepoRow): Promise<void> {
  const tracked = new Set(
    db.select().from(worktreePool).where(eq(worktreePool.repoId, repo.id)).all().map((e) => e.location),
  )

  let porcelain: string
  try {
    porcelain = await simpleGit(repo.path).raw(["worktree", "list", "--porcelain"])
  } catch {
    return
  }

  for (const wt of parseWorktreePorcelain(porcelain)) {
    if (!wt.branch?.startsWith("pool/pool-")) continue
    // Reserve locations are flat single-segment names directly under
    // workspacesPath (see buildOneReserve), so basename recovers the DB location.
    const location = path.basename(wt.path)
    if (tracked.has(location)) continue
    try {
      await removeWorktree(repo.path, wt.path)
      await simpleGit(repo.path).raw(["branch", "-D", wt.branch]).catch(() => {})
      logger.info(`[reserve] removed orphan ${location} for repo ${repo.name}`)
    } catch (err) {
      const msg = String((err as Error).message ?? err).split("\n")[0]
      logger.warn(`[reserve] failed to remove orphan ${location}: ${msg}`)
    }
  }
}

/** Reconcile one repo's reserve pool: prune orphans and missing-dir rows, trim
 * to the target depth, then top up to the target. */
async function reconcileReservePool(repo: RepoRow): Promise<void> {
  if (repo.type === "folder") return
  if (!fs.existsSync(repo.path)) return

  await removeOrphanReserves(repo)

  // Drop tracked rows whose worktree directory is gone.
  for (const entry of db.select().from(worktreePool).where(eq(worktreePool.repoId, repo.id)).all()) {
    if (!fs.existsSync(path.join(repo.workspacesPath, entry.location))) {
      db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
    }
  }

  // Trim to the target depth (older configs may have left more than we want).
  const target = reserveTarget(repo)
  const live = db.select().from(worktreePool).where(eq(worktreePool.repoId, repo.id)).all()
  for (const entry of live.slice(target)) {
    try { await removeWorktree(repo.path, path.join(repo.workspacesPath, entry.location)) } catch { /* gone */ }
    db.delete(worktreePool).where(eq(worktreePool.id, entry.id)).run()
  }

  await ensureReserve(repo.id)
}

/**
 * On server startup: reconcile every repo's reserve pool — remove orphaned
 * pool worktrees, trim to the per-repo target depth, then top each repo up to
 * its target.
 */
export async function initializeReserves(): Promise<void> {
  const allRepos = db.select().from(repos).all()
  for (const repo of allRepos) {
    await reconcileReservePool(repo).catch((err) =>
      logger.error({ err }, `[reserve] init failed for ${repo.name}`),
    )
  }
}
