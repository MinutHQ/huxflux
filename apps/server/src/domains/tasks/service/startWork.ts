import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import * as path from "node:path"
import { db } from "../../../db/index.js"
import { agents, repos, tasks, taskAgents, taskComments } from "../../../db/schema.js"
import { tasksWs } from "../tasks.ws.js"
import { runAgent } from "../../agent-runner/agent-runner.service.js"
import { getSettings } from "../../settings/settings.service.js"
import { createWorktree } from "../../git/worktrees.js"
import { loadAllTasks } from "./loadTasks.js"
import { buildChatRunOptions } from "../../agents/chatRun.js"

interface StartWorkResult {
  agentId?: string
  error?: string
  tasks?: Awaited<ReturnType<typeof loadAllTasks>>
}

/**
 * Spin up a working agent for a task: create a worktree, create the agent
 * row, link it to the task, transition the task to in-progress, then fire
 * the first runAgent turn with a task-aware system prompt. Returns an
 * `error` field instead of throwing so the route can serialize it.
 */
export async function startWorkForTask(taskId: string): Promise<StartWorkResult> {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) return { error: "Task not found" }
  if (!task.repoId) return { error: "Task has no repo assigned — set a repo first" }

  const repo = db.select().from(repos).where(eq(repos.id, task.repoId)).get()
  if (!repo) return { error: "Repo not found" }

  const created = createAgentRowForTask(task, taskId)
  const worktreePath = path.join(repo.workspacesPath, created.agentLocation)

  // The legacy route builds a task-aware system prompt here but never passes
  // it to the runner. The build is preserved (as dead code, via `void`) so
  // the structural extraction stays behaviour-preserving — wiring the prompt
  // through is a separate change.
  void buildTaskWorkContext(task, taskId)

  // Create worktree (clean up agent row on failure)
  try {
    await createWorktree(repo.path, created.branch, worktreePath, task.projectKey ? `origin/${task.projectKey}` : repo.branchFrom)
  } catch (err) {
    db.delete(agents).where(eq(agents.id, created.agentId)).run()
    db.delete(taskAgents).where(eq(taskAgents.agentId, created.agentId)).run()
    const message = err instanceof Error ? err.message : String(err)
    return { error: `Failed to create worktree: ${message}` }
  }

  // Send initial implement-this message
  const settings = getSettings()
  runAgent(
    `Implement the following task:\n\n${task.description ?? task.title}`,
    buildChatRunOptions({
      agentId: created.agentId,
      worktreePath,
      model: settings.defaultModel ?? "Sonnet 4.6",
      provider: settings.defaultProvider,
    }),
  )

  return { agentId: created.agentId, tasks: await loadAllTasks() }
}

interface AgentRowCreation {
  agentId: string
  branch: string
  agentLocation: string
}

function createAgentRowForTask(task: typeof tasks.$inferSelect, taskId: string): AgentRowCreation {
  const slug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)
  const branch = `task/${taskId.slice(0, 8)}/${slug}`
  const agentId = uuid()
  const now = new Date().toISOString()
  const settings = getSettings()
  const agentLocation = `task-${taskId.slice(0, 8)}-${Date.now()}`

  db.insert(agents).values({
    id: agentId,
    repoId: task.repoId,
    title: task.title.slice(0, 60),
    status: "in-progress",
    branch,
    model: settings.defaultModel ?? "Sonnet 4.6",
    location: agentLocation,
    provider: settings.defaultProvider ?? "claude",
    taskId,
    createdAt: now,
    updatedAt: now,
  }).run()

  // Link agent to task + transition task to in-progress
  db.insert(taskAgents).values({ id: uuid(), taskId, agentId }).run()
  db.update(tasks).set({ status: "in-progress", updatedAt: now }).where(eq(tasks.id, taskId)).run()
  tasksWs.taskUpdated(taskId)

  return { agentId, branch, agentLocation }
}

/**
 * Build the task-aware system prompt used for the initial assistant turn.
 * Includes the task body, optional parent task context, and the running
 * refinement-thread comments so the agent has full background.
 */
function buildTaskWorkContext(task: typeof tasks.$inferSelect, taskId: string): string {
  const comments = db.select().from(taskComments).where(eq(taskComments.taskId, taskId)).all()
  const commentContext = comments.length > 0
    ? "\n\nRefinement thread:\n" + comments.map((c: { author: string; content: string }) => `${c.author}: ${c.content}`).join("\n\n")
    : ""

  let parentContext = ""
  if (task.parentId) {
    const parent = db.select().from(tasks).where(eq(tasks.id, task.parentId)).get()
    if (parent) {
      parentContext = `\n\nParent task: ${parent.title}${parent.description ? `\n${parent.description}` : ""}`
    }
  }

  return `You are working on: ${task.title}${task.jiraKey ? ` (${task.jiraKey})` : ""}

${task.description ?? "No description provided."}
${parentContext}
${commentContext}

If you have questions or encounter blockers, post them via:
<huxflux:tasks.comment taskId="${taskId}">your question</huxflux:tasks.comment>

When the task is complete, signal it via:
<huxflux:tasks.status taskId="${taskId}" status="done"/>`
}
