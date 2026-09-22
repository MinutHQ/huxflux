import { readdirSync, readFileSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { taskListItemSchema, type TaskListItem, type TaskListState } from "@huxflux/shared"
import { agentsWs } from "../../agents/agents.ws.js"

// Claude's TaskCreate / TaskUpdate task list. The CLI is the writer: it keeps
// one JSON file per task under `<config dir>/tasks/<list id>/`, and the runner
// pins the list id to the agent id via CLAUDE_CODE_TASK_LIST_ID (see
// `buildSpawnEnv`). This module only reads that directory, so the disk store
// stays the single source of truth and a reload after a restart still shows
// the list. Nothing here is persisted in our own DB.

/** Tool names whose result means the on-disk list may have changed. */
const TASK_LIST_TOOLS = new Set(["TaskCreate", "TaskUpdate"])

/** Mirrors the CLI's own list-id sanitiser so the directory name matches. */
function sanitizeListId(listId: string): string {
  return listId.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude")
}

/** Directory the CLI writes this agent's task files into. */
export function taskListDir(agentId: string): string {
  return path.join(claudeConfigDir(), "tasks", sanitizeListId(agentId))
}

export function isTaskListTool(toolName: string | undefined): boolean {
  return toolName !== undefined && TASK_LIST_TOOLS.has(toolName)
}

/**
 * Read the agent's task list from disk. A missing directory means no list has
 * been created yet; unreadable or malformed files are skipped rather than
 * failing the whole read, since the CLI may be mid-write.
 */
export function readTaskList(agentId: string): TaskListState {
  const dir = taskListDir(agentId)
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return { tasks: [] }
  }
  const tasks: TaskListItem[] = []
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue
    const parsed = readTaskFile(path.join(dir, name))
    if (parsed) tasks.push(parsed)
  }
  tasks.sort(compareTaskIds)
  return { tasks }
}

function readTaskFile(file: string): TaskListItem | null {
  try {
    const result = taskListItemSchema.safeParse(JSON.parse(readFileSync(file, "utf8")))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Numeric ids ("1", "2", "10") in order; anything else falls back to string order. */
function compareTaskIds(a: TaskListItem, b: TaskListItem): number {
  const na = Number(a.id)
  const nb = Number(b.id)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a.id.localeCompare(b.id)
}

/**
 * Called with every tool result. When the tool was TaskCreate or TaskUpdate
 * the CLI has already written the file, so re-read the list and push it to
 * subscribed clients.
 */
export function noteTaskListToolResult(agentId: string, toolName: string | undefined): void {
  if (!isTaskListTool(toolName)) return
  agentsWs.taskListState(agentId, readTaskList(agentId))
}
