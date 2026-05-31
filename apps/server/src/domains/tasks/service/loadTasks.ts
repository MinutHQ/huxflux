import { eq, isNull, asc } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { tasks, taskAgents, taskComments, taskDependencies, agents, repos } from "../../../db/schema.js"
import type { TaskItemOut, TaskCommentOut, TaskAgentOut, TaskAgentRow, TaskDepRow } from "../tasks.types.js"

/**
 * Load every task in the system as a tree. The shape is what every task
 * endpoint returns: tree of TaskItemOut, with hidden refine agents flagged
 * via `refineAgentId` and repo names resolved on each row.
 */
export async function loadAllTasks(): Promise<TaskItemOut[]> {
  const allTasks = db.select().from(tasks).orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)).all()
  const allComments = db.select().from(taskComments).orderBy(asc(taskComments.createdAt)).all()
  const allAgentLinks = db
    .select({
      taskId: taskAgents.taskId,
      agentId: taskAgents.agentId,
      title: agents.title,
      status: agents.status,
      branch: agents.branch,
      pr: agents.pr,
      prNumber: agents.prNumber,
      prStatus: agents.prStatus,
    })
    .from(taskAgents)
    .innerJoin(agents, eq(taskAgents.agentId, agents.id))
    .all()

  const allDeps = db.select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId }).from(taskDependencies).all()
  const allRepos = db.select({ id: repos.id, name: repos.name }).from(repos).all()
  const repoMap = new Map<string, string>(allRepos.map((r: { id: string; name: string }) => [r.id, r.name]))

  // Find hidden refine agents per task (agents with taskId set, not deleted)
  const refineAgentRows = db.select().from(agents).where(isNull(agents.deletedAt)).all()
  const refineAgentMap = new Map<string, string>()
  for (const a of refineAgentRows) {
    if (a.taskId) refineAgentMap.set(a.taskId, a.id)
  }

  return buildTaskTree(allTasks, allComments, allAgentLinks, allDeps, refineAgentMap, repoMap)
}

function buildTaskTree(
  rows: (typeof tasks.$inferSelect)[],
  commentRows: (typeof taskComments.$inferSelect)[],
  agentRows: TaskAgentRow[],
  depRows: TaskDepRow[],
  refineAgentMap: Map<string, string>,
  repoMap: Map<string, string>,
): TaskItemOut[] {
  const commentsByTask = groupComments(commentRows)
  const agentsByTask = groupAgents(agentRows)
  const depsByTask = groupDeps(depRows)

  const itemMap = new Map<string, TaskItemOut>()
  for (const row of rows) {
    itemMap.set(row.id, buildTaskItem(row, { commentsByTask, agentsByTask, depsByTask, refineAgentMap, repoMap }))
  }

  // Build tree
  const roots: TaskItemOut[] = []
  for (const item of itemMap.values()) {
    if (item.parentId && itemMap.has(item.parentId)) {
      itemMap.get(item.parentId)!.subtasks.push(item)
    } else {
      roots.push(item)
    }
  }
  return roots
}

function groupComments(commentRows: (typeof taskComments.$inferSelect)[]): Map<string, TaskCommentOut[]> {
  const commentsByTask = new Map<string, TaskCommentOut[]>()
  for (const c of commentRows) {
    const list = commentsByTask.get(c.taskId) ?? []
    list.push({ id: c.id, author: c.author, role: c.role as "ai" | "user", content: c.content, agentId: c.agentId, createdAt: c.createdAt })
    commentsByTask.set(c.taskId, list)
  }
  return commentsByTask
}

function groupAgents(agentRows: TaskAgentRow[]): Map<string, TaskAgentOut[]> {
  const agentsByTask = new Map<string, TaskAgentOut[]>()
  for (const a of agentRows) {
    const list = agentsByTask.get(a.taskId) ?? []
    list.push(toAgentOut(a))
    agentsByTask.set(a.taskId, list)
  }
  return agentsByTask
}

function toAgentOut(a: TaskAgentRow): TaskAgentOut {
  let prMerged = false
  let prDraft = false
  let ciStatus: TaskAgentOut["ciStatus"] = null
  if (a.prStatus) {
    try {
      const ps = JSON.parse(a.prStatus) as { merged?: boolean; draft?: boolean; checks?: Array<{ status?: string; conclusion?: string }> }
      prMerged = !!ps.merged
      prDraft = !!ps.draft
      if (ps.checks && ps.checks.length > 0) {
        const allDone = ps.checks.every((c) => c.status === "completed")
        const anyFailed = ps.checks.some((c) => c.conclusion === "failure")
        ciStatus = !allDone ? "pending" : anyFailed ? "failing" : "passing"
      }
    } catch { /* ignore malformed prStatus JSON */ }
  }
  return {
    agentId: a.agentId,
    agentTitle: a.title,
    agentStatus: a.status,
    agentBranch: a.branch,
    prNumber: a.prNumber,
    prUrl: a.pr,
    prMerged,
    prDraft,
    ciStatus,
  }
}

function groupDeps(depRows: TaskDepRow[]): Map<string, string[]> {
  const depsByTask = new Map<string, string[]>()
  for (const d of depRows) {
    const list = depsByTask.get(d.taskId) ?? []
    list.push(d.dependsOnTaskId)
    depsByTask.set(d.taskId, list)
  }
  return depsByTask
}

interface BuildCtx {
  commentsByTask: Map<string, TaskCommentOut[]>
  agentsByTask: Map<string, TaskAgentOut[]>
  depsByTask: Map<string, string[]>
  refineAgentMap: Map<string, string>
  repoMap: Map<string, string>
}

function buildTaskItem(row: typeof tasks.$inferSelect, ctx: BuildCtx): TaskItemOut {
  return {
    id: row.id,
    parentId: row.parentId,
    jiraKey: row.jiraKey,
    title: row.title,
    description: row.description,
    status: row.status as TaskItemOut["status"],
    priority: row.priority,
    assignee: row.assignee,
    projectKey: row.projectKey,
    repoId: row.repoId,
    repoName: row.repoId ? (ctx.repoMap.get(row.repoId) ?? null) : null,
    refineAgentId: ctx.refineAgentMap.get(row.id) ?? null,
    agents: ctx.agentsByTask.get(row.id) ?? [],
    comments: ctx.commentsByTask.get(row.id) ?? [],
    subtasks: [],
    dependencies: ctx.depsByTask.get(row.id) ?? [],
    sprintName: row.sprintName,
    sprintState: row.sprintState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
