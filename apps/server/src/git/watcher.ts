import chokidar, { type FSWatcher } from "chokidar"
import { getFileChanges } from "./worktrees.js"
import { emit } from "../ws/handler.js"
import { db } from "../db/index.js"
import { fileChanges as fileChangesTable } from "../db/schema.js"
import { eq } from "drizzle-orm"

interface WatchEntry {
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
}

const watchers = new Map<string, WatchEntry>()

const DEBOUNCE_MS = 600

async function refresh(agentId: string, worktreePath: string, branchFrom: string) {
  try {
    const files = await getFileChanges(worktreePath, branchFrom)
    // Only update DB+emit if we got a result (even empty is valid — it means no changes)
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
    emit(agentId, { type: "file:changed", agentId, files })
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
    interval: 1500,
    binaryInterval: 3000,
  })

  const entry: WatchEntry = { watcher, timer: null }
  watchers.set(agentId, entry)

  const schedule = (_filePath: string) => {
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
