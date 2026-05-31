import { eq } from "drizzle-orm"
import { simpleGit } from "simple-git"
import * as path from "node:path"
import { db } from "../../../db/index.js"
import { agents, repos } from "../../../db/schema.js"
import { taskAgents, tasks } from "../../../db/schema.js"
import { getPRStatus, findPRForBranch, prStatusToAgentStatus } from "../prStatus.js"
import { getRemoteUrl } from "../../git/worktrees.js"
import { agentsWs } from "../../agents/agents.ws.js"
import { tasksWs } from "../../tasks/tasks.ws.js"
import { getSettings } from "../../settings/settings.service.js"
import { jiraTransitionIssue } from "../../tasks/jiraClient.js"
import type { PRStatus } from "../../../types.js"
import { monitorPRComments, monitorCI, monitorMergeConflicts } from "./monitors.js"
import { sendToAgent } from "./sendToAgent.js"

type AgentRow = typeof agents.$inferSelect

async function syncBranchFromGit(agent: AgentRow): Promise<AgentRow> {
  if (agent.noWorktree || !agent.repoId) return agent
  const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
  if (!repo) return agent
  try {
    const worktreePath = path.join(repo.workspacesPath, agent.location)
    const actualBranch = (await simpleGit(worktreePath).revparse(["--abbrev-ref", "HEAD"])).trim()
    if (actualBranch && actualBranch !== agent.branch) {
      db.update(agents).set({ branch: actualBranch, updatedAt: new Date().toISOString() }).where(eq(agents.id, agent.id)).run()
      const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
      if (updated) agentsWs.agentUpdated(updated as never)
      console.info(`[poller] ${agent.id}: branch synced to ${actualBranch}`)
      return { ...agent, branch: actualBranch }
    }
  } catch { /* worktree may not exist */ }
  return agent
}

async function applyPRStatusUpdate(agent: AgentRow, pr: PRStatus): Promise<void> {
  const newStatus = prStatusToAgentStatus(pr)
  const prStatusJson = JSON.stringify(pr)
  const statusChanged = newStatus !== agent.status
  const prChanged = prStatusJson !== agent.prStatus || pr.number !== agent.prNumber
  if (!statusChanged && !prChanged) return

  const now = new Date().toISOString()
  await db.update(agents).set({
    prNumber: pr.number, prStatus: prStatusJson, status: newStatus, pr: pr.url, updatedAt: now,
  }).where(eq(agents.id, agent.id))

  const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
  if (updated) agentsWs.agentUpdated({ ...updated, prStatus: pr } as never)

  if (statusChanged && agent.threadParentId) {
    const parent = db.select().from(agents).where(eq(agents.id, agent.threadParentId)).get()
    if (parent && !parent.deletedAt) {
      const msg = newStatus === "done"
        ? `Thread agent "${agent.title}" has completed its work${pr.url ? ` and has a PR: ${pr.url}` : ""}.`
        : `Thread agent "${agent.title}" status changed to ${newStatus}.`
      sendToAgent(parent.id, msg, agent.title).catch(() => {})
    }
  }
  if (newStatus === "done" && statusChanged) await autoCompleteLinkedTasks(agent.id, now)
}

async function autoCompleteLinkedTasks(agentId: string, now: string): Promise<void> {
  const links = db.select().from(taskAgents).where(eq(taskAgents.agentId, agentId)).all()
  for (const link of links) {
    const task = db.select().from(tasks).where(eq(tasks.id, link.taskId)).get()
    if (!task || task.status === "done") continue
    db.update(tasks).set({ status: "done", updatedAt: now }).where(eq(tasks.id, link.taskId)).run()
    tasksWs.taskUpdated(link.taskId)
    console.info(`[poller] ${agentId}: task ${link.taskId} auto-completed (PR merged)`)
    if (task.jiraKey) await jiraTransitionIssue(task.jiraKey, "done").catch(() => {})
  }
}

async function runMonitors(agent: AgentRow, repoUrl: string, pr: PRStatus): Promise<void> {
  if (!pr.number) return
  if (agent.status === "done" || agent.status === "cancelled") return
  const s = getSettings()
  const prCommentsEnabled = agent.prCommentMonitoring != null ? agent.prCommentMonitoring === 1 : (s.prCommentMonitoring ?? true)
  const ciEnabled = agent.ciMonitoring != null ? agent.ciMonitoring === 1 : (s.ciMonitoring ?? true)
  if (prCommentsEnabled) await monitorPRComments(agent, repoUrl, pr.number)
  if (ciEnabled) await monitorCI(agent, repoUrl, pr.number)
  await monitorMergeConflicts(agent, pr)
}

export async function pollAgent(initial: AgentRow): Promise<void> {
  if (!initial.repoId || !initial.branch) return
  const repo = db.select().from(repos).where(eq(repos.id, initial.repoId)).get()
  if (!repo) return

  const agent = await syncBranchFromGit(initial)
  const repoUrl = await getRemoteUrl(repo.path, repo.remote)
  if (!repoUrl) return

  try {
    const pr = agent.prNumber ? await getPRStatus(repoUrl, agent.prNumber) : await findPRForBranch(repoUrl, agent.branch)
    if (!pr) return
    await applyPRStatusUpdate(agent, pr)
    await runMonitors(agent, repoUrl, pr)
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[poller] ${agent.id}: ${(err as Error).message}`)
    }
  }
}
