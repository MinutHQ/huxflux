import chokidar, { type FSWatcher } from "chokidar"
import { simpleGit } from "simple-git"
import * as fs from "node:fs"
import { getFileChanges } from "./worktrees.js"
import { agentsWs } from "../agents/agents.ws.js"
import { db } from "../../db/index.js"
import { fileChanges as fileChangesTable, agents as agentsTable } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import type { AgentSummary } from "../../types.js"

interface WatchEntry {
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
}

const watchers = new Map<string, WatchEntry>()

const DEBOUNCE_MS = 250

// Chokidar 5 dropped its fsevents path; the "native" mode just uses
// `fs.watch`, which opens one file descriptor per watched directory. With
// several agents and their nested worktrees that blows past the macOS
// default `ulimit -n` and starts throwing EMFILE (which in turn cascades to
// `spawn EBADF` everywhere else in the process). Polling is the only safe
// option here, but the old 1500ms interval + 600ms debounce was the reason
// the files panel felt slow after agent creation. 400ms polling + 250ms
// debounce keeps perceived latency under a second without melting the CPU.
const POLL_INTERVAL_MS = 400
const POLL_BINARY_INTERVAL_MS = 1000

async function refresh(agentId: string, worktreePath: string, branchFrom: string) {
  try {
    // Worktree may have been deleted (child agent removed) — stop watching
    if (!fs.existsSync(worktreePath)) {
      unwatchWorktree(agentId)
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
    console.error(`[watcher] refresh failed for agent ${agentId}:`, err)
  }
}

export function watchWorktree(agentId: string, worktreePath: string, branchFrom: string) {
  if (watchers.has(agentId)) return

  const watcher = chokidar.watch(worktreePath, {
    ignored: /(^|[/\\])(\.(git)|node_modules|\.next|\.nuxt|dist|build|\.cache|__pycache__|\.venv|venv|target)([/\\]|$)/,
    ignoreInitial: true,
    persistent: true,
    usePolling: true,
    interval: POLL_INTERVAL_MS,
    binaryInterval: POLL_BINARY_INTERVAL_MS,
  })

  const entry: WatchEntry = { watcher, timer: null }
  watchers.set(agentId, entry)

  const schedule = () => {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      void refresh(agentId, worktreePath, branchFrom)
    }, DEBOUNCE_MS)
  }

  watcher.on("add", schedule)
  watcher.on("change", schedule)
  watcher.on("unlink", schedule)
}

export function unwatchWorktree(agentId: string) {
  const entry = watchers.get(agentId)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  entry.watcher.close().catch(() => {})
  watchers.delete(agentId)
}

export async function refreshWorktree(agentId: string, worktreePath: string, branchFrom: string) {
  await refresh(agentId, worktreePath, branchFrom)
}
