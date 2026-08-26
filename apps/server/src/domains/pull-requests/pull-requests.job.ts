import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm"
import { db } from "../../db/index.js"
import { agents, repos } from "../../db/schema.js"
import { getSettings } from "../settings/settings.service.js"
import { logger } from "../../logger.js"
import { agentsWs } from "../agents/agents.ws.js"
import { isAgentRunning } from "../agent-runner/agent-runner.service.js"
import type { Job } from "../../jobTypes.js"
import { pollAgent } from "./job/pollAgent.js"
import { isRateLimited, rateLimitWaitSec } from "./job/rateLimitState.js"
import { getRemoteUrl } from "../git/worktrees.js"
import { parseRepo, getOctokit } from "./service/octokit.js"

const POLL_STATUSES = ["in-progress", "in-review", "draft-pr"]
const TERMINAL_STATUSES = ["done", "cancelled"]
const CONCURRENCY = 3

type AgentRow = typeof agents.$inferSelect

function retireOrphanedThreadAgents(rows: AgentRow[]): AgentRow[] {
  const threadAgents = rows.filter((a) => a.threadParentId)
  if (threadAgents.length === 0) return rows

  const parentIds = [...new Set(threadAgents.map((a) => a.threadParentId!))]
  const parents: AgentRow[] = db.select().from(agents).where(inArray(agents.id, parentIds)).all()
  const parentById = new Map<string, AgentRow>(parents.map((p) => [p.id, p]))

  const now = new Date().toISOString()
  const retired = new Set<string>()
  for (const thread of threadAgents) {
    const parent = parentById.get(thread.threadParentId!)
    const parentGone = !parent || parent.deletedAt
    const parentDone = parent && TERMINAL_STATUSES.includes(parent.status)
    if ((parentGone || parentDone) && !thread.prNumber && !thread.streaming && !isAgentRunning(thread.id)) {
      const status = parent?.status ?? "done"
      db.update(agents).set({ status, updatedAt: now }).where(eq(agents.id, thread.id)).run()
      const updated = db.select().from(agents).where(eq(agents.id, thread.id)).get()
      if (updated) agentsWs.agentUpdated(updated as never)
      retired.add(thread.id)
      logger.info({ agentId: thread.id, reason: parentGone ? "orphaned" : "parent-done" }, "[job] retired thread agent")
    }
  }

  return retired.size > 0 ? rows.filter((a) => !retired.has(a.id)) : rows
}

async function runCycle(): Promise<void> {
  if (isRateLimited()) {
    logger.info({ waitSec: rateLimitWaitSec() }, "[job] GitHub rate-limited, skipping cycle")
    return
  }

  const startedAt = Date.now()
  let rows = db.select().from(agents)
    .where(and(
      inArray(agents.status, POLL_STATUSES),
      isNotNull(agents.repoId),
      isNull(agents.deletedAt),
    ))
    .all()

  if (rows.length === 0) return

  rows = retireOrphanedThreadAgents(rows)
  if (rows.length === 0) return

  logger.info(
    { agentCount: rows.length, batchSize: CONCURRENCY },
    "[job] polling agents for PR status, CI, review comments and merge conflicts",
  )
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    if (isRateLimited()) {
      logger.info("[job] rate-limited mid-cycle, stopping early")
      break
    }
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(pollAgent))
  }
  logger.info(
    { agentCount: rows.length, durationMs: Date.now() - startedAt },
    "[job] poll cycle complete",
  )
}

async function repairWrongPRAssignments(): Promise<void> {
  const cancelled = db.select().from(agents)
    .where(and(
      eq(agents.status, "cancelled"),
      isNotNull(agents.prNumber),
      isNull(agents.deletedAt),
    ))
    .all()
  if (cancelled.length === 0) return

  logger.info({ count: cancelled.length }, "[job] checking cancelled agents for wrong PR assignments")
  const octokit = getOctokit()
  let repaired = 0

  for (const agent of cancelled) {
    if (!agent.repoId || !agent.prNumber) continue
    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) continue
    const repoUrl = await getRemoteUrl(repo.path, repo.remote)
    if (!repoUrl) continue

    try {
      const { owner, repo: repoName } = parseRepo(repoUrl)
      const { data: pr } = await octokit.pulls.get({ owner, repo: repoName, pull_number: agent.prNumber })
      if (pr.head.ref === agent.branch) continue

      const now = new Date().toISOString()
      db.update(agents).set({
        status: "in-progress", prNumber: null, prStatus: null, pr: null, updatedAt: now,
      }).where(eq(agents.id, agent.id)).run()
      const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
      if (updated) agentsWs.agentUpdated(updated as never)
      repaired++
      logger.info({ agentId: agent.id, title: agent.title, wrongPr: agent.prNumber }, "[job] repaired agent with wrong PR assignment")
    } catch (err) {
      logger.warn({ err, agentId: agent.id }, "[job] could not verify PR for cancelled agent")
    }
  }

  if (repaired > 0) logger.info({ repaired, total: cancelled.length }, "[job] PR assignment repair complete")
}

export const pullRequestsJob: Job = {
  name: "pull-requests",
  start() {
    const interval = getSettings().pollingIntervalMs ?? 60_000
    const onError = (err: unknown) => logger.error({ err }, "[job] poll cycle failed")
    repairWrongPRAssignments().catch(onError)
    setTimeout(() => runCycle().catch(onError), 5_000)
    setInterval(() => runCycle().catch(onError), interval)
  },
}
