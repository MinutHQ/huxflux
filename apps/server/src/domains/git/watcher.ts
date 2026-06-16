import { simpleGit } from "simple-git"
import * as fs from "node:fs"
import * as path from "node:path"
import { getFileChanges } from "./worktrees.js"
import { agentsWs } from "../agents/agents.ws.js"
import { db } from "../../db/index.js"
import { fileChanges as fileChangesTable, agents as agentsTable, repos as reposTable } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import type { AgentSummary } from "../../types.js"
import { logger } from "../../logger.js"

interface WatchEntry {
  watcher: fs.FSWatcher
  timer: ReturnType<typeof setTimeout> | null
}

const watchers = new Map<string, WatchEntry>()

const DEBOUNCE_MS = 250

// Paths whose changes we don't care about — matched against the watch-relative
// path `fs.watch` reports (platform separator, hence `[/\\]`).
const IGNORED = /(^|[/\\])(\.git|node_modules|\.next|\.nuxt|dist|build|\.cache|__pycache__|\.venv|venv|target)([/\\]|$)/

async function refresh(agentId: string, worktreePath: string, branchFrom: string, owner?: WatchEntry) {
  try {
    // Worktree may have been deleted (child agent removed) — stop watching.
    // Only tear down if the watcher that scheduled this refresh is still the
    // active one. A stale in-flight refresh must not close a watcher that was
    // detached and freshly re-attached (unsubscribe → re-subscribe) while it ran.
    if (!fs.existsSync(worktreePath)) {
      if (!owner || watchers.get(agentId) === owner) unwatchWorktree(agentId)
      return
    }

    const [files, branchSummary] = await Promise.all([
      getFileChanges(worktreePath, branchFrom),
      simpleGit(worktreePath).branch().catch(() => null),
    ])

    // Sync branch name if it changed (e.g. Claude pushed a PR and renamed the branch)
    const currentBranch = branchSummary?.current
    if (currentBranch) {
      const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (agent && agent.branch !== currentBranch) {
        db.update(agentsTable)
          .set({ branch: currentBranch, updatedAt: new Date().toISOString() })
          .where(eq(agentsTable.id, agentId))
          .run()
        const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
        if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
      }
    }

    await db.delete(fileChangesTable).where(eq(fileChangesTable.agentId, agentId))
    if (files.length > 0) {
      for (const f of files) {
        await db.insert(fileChangesTable).values({
          id: `${agentId}-${f.path.replace(/[/\\]/g, "-")}`,
          agentId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
        })
      }
    }
    agentsWs.fileChanged(agentId, files.sort((a, b) => a.path.localeCompare(b.path)))
  } catch (err) {
    logger.error({ err }, `[watcher] refresh failed for agent ${agentId}`)
  }
}

export function watchWorktree(agentId: string, worktreePath: string, branchFrom: string) {
  if (watchers.has(agentId)) return

  const entry: WatchEntry = { watcher: null as unknown as fs.FSWatcher, timer: null }

  const schedule = () => {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      void refresh(agentId, worktreePath, branchFrom, entry)
    }, DEBOUNCE_MS)
  }

  // Native recursive watch. On macOS this is one FSEvents source for the whole
  // tree (no per-file polling, no per-directory file descriptor); on Linux it
  // is recursive inotify (Node 20+). Watching only the currently-open agent
  // (see `watchAgent`) keeps the watch count low enough that the per-directory
  // fd cost that used to force polling is no longer a concern.
  let watcher: fs.FSWatcher
  try {
    watcher = fs.watch(worktreePath, { recursive: true, persistent: true }, (_event, filename) => {
      if (filename && IGNORED.test(filename.toString())) return
      schedule()
    })
  } catch (err) {
    logger.error({ err, agentId }, "[watcher] failed to start fs.watch")
    return
  }
  watcher.on("error", (err) => logger.warn({ err, agentId }, "[watcher] fs.watch error"))

  entry.watcher = watcher
  watchers.set(agentId, entry)
}

/**
 * Resolve an agent's worktree from the DB and start watching it, then populate
 * its file changes once. Used to attach a watcher lazily when a client opens an
 * agent (see the subscription hook in the server entrypoint) rather than
 * watching every agent on boot. No-op if already watching, if the agent has no
 * worktree, or if the worktree path no longer exists on disk.
 */
export function watchAgent(agentId: string): void {
  if (watchers.has(agentId)) return
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!agent || !agent.repoId || agent.noWorktree) return
  const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
  if (!repo) return
  const worktreePath = path.join(repo.workspacesPath, agent.location)
  if (!fs.existsSync(worktreePath)) return
  const branchFrom = agent.baseBranch ?? repo.branchFrom
  watchWorktree(agentId, worktreePath, branchFrom)
  // Scope the initial refresh's teardown to this watcher generation (see refresh).
  void refresh(agentId, worktreePath, branchFrom, watchers.get(agentId)).catch(() => {})
}

export function unwatchWorktree(agentId: string) {
  const entry = watchers.get(agentId)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  try { entry.watcher.close() } catch { /* already closed */ }
  watchers.delete(agentId)
}

export async function refreshWorktree(agentId: string, worktreePath: string, branchFrom: string) {
  await refresh(agentId, worktreePath, branchFrom)
}
