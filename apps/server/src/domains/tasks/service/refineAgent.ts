import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import * as os from "node:os"
import { db } from "../../../db/index.js"
import { agents, repos, tasks } from "../../../db/schema.js"
import { getSettings } from "../../settings/settings.service.js"

/**
 * Get or create the hidden refine agent for a task. The refine agent is
 * filtered from the sidebar (`taskId` set), uses no worktree, and is reused
 * across follow-up messages via session resume. Returns the agent id plus
 * the resolved cwd (a repo path or homedir) so Claude has a valid project
 * context to run in.
 */
export function getOrCreateRefineAgent(taskId: string): { agentId: string; cwd: string } {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()!
  const allRepos: (typeof repos.$inferSelect)[] = db.select().from(repos).all()
  const targetRepo: typeof repos.$inferSelect | undefined = task.repoId
    ? allRepos.find((r) => r.id === task.repoId) ?? allRepos[0]
    : allRepos[0]
  const cwd = targetRepo?.path ?? os.homedir()

  // Check if a refine agent already exists for this task
  const existing = db.select().from(agents)
    .where(eq(agents.taskId, taskId))
    .all()
    .find((a) => !a.deletedAt)

  if (existing) {
    return { agentId: existing.id, cwd }
  }

  // Create new hidden refine agent
  const agentId = uuid()
  const now = new Date().toISOString()
  const settings = getSettings()

  db.insert(agents).values({
    id: agentId,
    repoId: targetRepo?.id ?? null,
    title: `Refine: ${task.title.slice(0, 40)}`,
    status: "in-progress",
    branch: "main",
    model: settings.defaultModel ?? "Sonnet 4.6",
    location: `refine-${taskId.slice(0, 8)}-${Date.now()}`,
    noWorktree: 1,
    provider: settings.defaultProvider ?? "claude",
    taskId,
    createdAt: now,
    updatedAt: now,
  }).run()

  return { agentId, cwd }
}

/**
 * Build the system / task context prompt prepended to every refine turn.
 * Describes the task itself, parent (if any), available repos, and the
 * `<huxflux:tasks.*>` XML tags the agent must emit to actually mutate the
 * task. All context is provided here so the agent doesn't shell out to
 * acli or other external Jira tooling.
 */
export function buildTaskContext(task: typeof tasks.$inferSelect, taskId: string): string {
  const subtaskRows = db.select().from(tasks).where(eq(tasks.parentId, taskId)).all()
  const parentRow = task.parentId ? db.select().from(tasks).where(eq(tasks.id, task.parentId)).get() : null
  const allRepos = db.select().from(repos).all()
  const repoList = allRepos.map((r: { name: string; path: string }) => `- ${r.name}: ${r.path}`).join("\n")

  return [
    `You are helping refine a task: "${task.title}"${task.jiraKey ? ` (${task.jiraKey})` : ""}.`,
    task.description ? `\nCurrent description:\n${task.description}` : "",
    subtaskRows.length > 0 ? `\nCurrent subtasks:\n${subtaskRows.map((s: { title: string; id: string }) => `- [${s.id}] ${s.title}`).join("\n")}` : "",
    parentRow ? `\nThis is a subtask of: "${parentRow.title}". You can only modify this subtask, not the parent.` : "",
    `\nAvailable repositories (use absolute paths to explore any of them):`,
    repoList || "(none configured)",
    ``,
    `IMPORTANT: You MUST use these XML tags to make changes to the task. Do NOT just describe changes in text — actually emit the tags so they are applied automatically:`,
    ``,
    `To update the description:`,
    `<huxflux:tasks.update taskId="${taskId}" field="description">`,
    `The full new description in markdown goes here.`,
    `</huxflux:tasks.update>`,
    ``,
    `To create a subtask:`,
    `<huxflux:tasks.create parentId="${taskId}">{"title":"Subtask title","description":"Subtask description in markdown"}</huxflux:tasks.create>`,
    ``,
    `To mark the task as ready (done refining):`,
    `<huxflux:tasks.status taskId="${taskId}" status="ready"/>`,
    ``,
    `You can emit multiple tags in a single response. Tags are processed and stripped from the displayed message.`,
    `After making changes, briefly explain what you did in plain text.`,
    ``,
    `All task context is provided above — do NOT use acli, jira, or other external tools to fetch task information.`,
    `Focus on exploring the codebase using the repo paths above.`,
  ].filter(Boolean).join("\n")
}
