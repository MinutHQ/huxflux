import { eq, notInArray, isNull, and } from "drizzle-orm"
import { simpleGit } from "simple-git"
import * as path from "node:path"
import { db } from "./db/index.js"
import { agents, repos, messages, taskAgents, tasks } from "./db/schema.js"
import { getPRStatus, findPRForBranch, getPRDetails } from "./github/client.js"
import { getRemoteUrl } from "./git/worktrees.js"
import { broadcast, emit } from "./ws/handler.js"
import { prStatusToAgentStatus } from "./github/prStatus.js"
import { isAgentRunning } from "./claude/runner.js"
import { config } from "./config.js"
import { getSettings } from "./settings.js"
import type { PRStatus, PRDetails } from "./types.js"

// Track what we've already seen to avoid re-sending
const lastSeenCommentIds = new Map<string, Set<string>>() // agentId → set of comment IDs
const lastSeenCheckConclusions = new Map<string, string>() // agentId → "success" | "failure" | ...

async function pollAgent(agent: typeof agents.$inferSelect) {
  if (!agent.repoId) return
  if (!agent.branch) return
  const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
  if (!repo) return
  // Folder-type repos have no branches, no remotes, and no PRs — nothing to poll.
  if (repo.type === "folder") return

  // ── 1. Sync branch name from git worktree ─────────────────────────────
  if (!agent.noWorktree) {
    try {
      const worktreePath = path.join(repo.workspacesPath, agent.location)
      const actualBranch = (await simpleGit(worktreePath).revparse(["--abbrev-ref", "HEAD"])).trim()
      if (actualBranch && actualBranch !== agent.branch) {
        db.update(agents).set({ branch: actualBranch, updatedAt: new Date().toISOString() }).where(eq(agents.id, agent.id)).run()
        agent = { ...agent, branch: actualBranch }
        const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
        if (updated) broadcast({ type: "agent:updated", agent: updated as any })
        console.log(`[poller] ${agent.id}: branch synced to ${actualBranch}`)
      }
    } catch { /* worktree may not exist */ }
  }

  // ── 2. Sync PR status ─────────────────────────────────────────────────
  const repoUrl = await getRemoteUrl(repo.path, repo.remote)
  if (!repoUrl) return

  try {
    let pr: PRStatus | null = null

    if (agent.prNumber) {
      pr = await getPRStatus(repoUrl, agent.prNumber)
    } else {
      pr = await findPRForBranch(repoUrl, agent.branch)
    }

    if (!pr) return

    const newStatus = prStatusToAgentStatus(pr)
    const prStatusJson = JSON.stringify(pr)

    const statusChanged = newStatus !== agent.status
    const prChanged = prStatusJson !== agent.prStatus || pr.number !== agent.prNumber

    if (statusChanged || prChanged) {
      const now = new Date().toISOString()
      await db.update(agents)
        .set({
          prNumber: pr.number,
          prStatus: prStatusJson,
          status: newStatus,
          pr: pr.url,
          updatedAt: now,
        })
        .where(eq(agents.id, agent.id))

      const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
      if (updated) {
        broadcast({ type: "agent:updated", agent: { ...updated, prStatus: pr } as any })
      }

      // Notify thread parent when child agent status changes
      if (statusChanged && agent.threadParentId) {
        const parentAgent = db.select().from(agents).where(eq(agents.id, agent.threadParentId)).get()
        if (parentAgent && !parentAgent.deletedAt) {
          const statusMsg = newStatus === "done"
            ? `Thread agent "${agent.title}" has completed its work${pr.url ? ` and has a PR: ${pr.url}` : ""}.`
            : `Thread agent "${agent.title}" status changed to ${newStatus}.`
          sendToAgent(parentAgent.id, statusMsg, agent.title).catch(() => {})
        }
      }

      // Auto-complete linked task when PR is merged
      if (newStatus === "done" && statusChanged) {
        const links = db.select().from(taskAgents).where(eq(taskAgents.agentId, agent.id)).all()
        for (const link of links) {
          const task = db.select().from(tasks).where(eq(tasks.id, link.taskId)).get()
          if (task && task.status !== "done") {
            db.update(tasks).set({ status: "done", updatedAt: now }).where(eq(tasks.id, link.taskId)).run()
            broadcast({ type: "task:updated", taskId: link.taskId })
            console.log(`[poller] ${agent.id}: task ${link.taskId} auto-completed (PR merged)`)
            // Jira transition if configured
            try {
              const jira = await import("./jira/client.js")
              if (task.jiraKey) {
                await jira.transitionIssue(task.jiraKey, "done").catch(() => {})
              }
            } catch {}
          }
        }
      }
    }

    // ── 3. Monitor PR comments — send new ones to the agent ─────────
    if (pr.number && agent.status !== "done" && agent.status !== "cancelled") {
      const pollerSettings = getSettings()
      const prCommentsEnabled = agent.prCommentMonitoring != null ? agent.prCommentMonitoring === 1 : (pollerSettings.prCommentMonitoring ?? true)
      const ciEnabled = agent.ciMonitoring != null ? agent.ciMonitoring === 1 : (pollerSettings.ciMonitoring ?? true)
      if (prCommentsEnabled) await monitorPRComments(agent, repoUrl, pr.number)
      if (ciEnabled) await monitorCI(agent, repoUrl, pr.number)
      await monitorMergeConflicts(agent, pr)
    }
  } catch (err) {
    console.warn(`[poller] ${agent.id}: ${(err as Error).message}`)
  }
}

// ── PR Comment Monitoring ────────────────────────────────────────────────────

async function monitorPRComments(
  agent: typeof agents.$inferSelect,
  repoUrl: string,
  prNumber: number,
): Promise<void> {
  // Skip if agent is currently running — don't interrupt it
  if (isAgentRunning(agent.id)) return

  try {
    const details = await getPRDetails(repoUrl, prNumber)

    // Collect all comment IDs we've seen
    let seen = lastSeenCommentIds.get(agent.id)
    if (!seen) {
      // First run: seed with all existing comments so we don't replay history
      seen = new Set<string>()
      for (const thread of details.threads) {
        for (const c of thread.comments) seen.add(c.id)
      }
      for (const c of details.issueComments) seen.add(String(c.id))
      lastSeenCommentIds.set(agent.id, seen)
      return
    }

    // Find new unresolved thread comments (not from the current user)
    const newComments: Array<{ author: string; body: string; path?: string; line?: number; commentId?: number }> = []

    for (const thread of details.threads) {
      if (thread.isResolved) continue
      for (const c of thread.comments) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        if (c.author === details.author) continue
        newComments.push({
          author: c.author,
          body: c.body,
          path: c.path ?? thread.path,
          line: c.line ?? thread.line,
          commentId: c.databaseId,
        })
      }
    }

    // Find new issue comments (general discussion)
    for (const c of details.issueComments) {
      const cId = String(c.id)
      if (seen.has(cId)) continue
      seen.add(cId)
      if (c.author === details.author) continue
      newComments.push({ author: c.author, body: c.body, commentId: c.id })
    }

    if (newComments.length === 0) return

    // Build a message for the agent
    const parts = newComments.map((c) => {
      let prefix = `**${c.author}** commented`
      if (c.path) prefix += ` on \`${c.path}${c.line ? `:${c.line}` : ""}\``
      const idNote = c.commentId ? ` (comment ID: ${c.commentId})` : ""
      return `${prefix}${idNote}:\n> ${c.body.split("\n").join("\n> ")}`
    })

    const message = `New PR review comment${newComments.length > 1 ? "s" : ""}:\n\n${parts.join("\n\n---\n\n")}\n\nPlease address ${newComments.length > 1 ? "these comments" : "this comment"}. Fix the code if needed, then reply on GitHub using:\n  <huxflux:pr-reply commentId="COMMENT_ID">your reply</huxflux:pr-reply>`

    console.log(`[poller] ${agent.id}: sending ${newComments.length} new PR comment(s) to agent`)
    await sendToAgent(agent.id, message, "PR Review")
  } catch (err) {
    // Non-critical — skip this cycle
    console.warn(`[poller] PR comment monitor failed for ${agent.id}: ${(err as Error).message}`)
  }
}

// ── CI Monitoring ────────────────────────────────────────────────────────────

async function monitorCI(
  agent: typeof agents.$inferSelect,
  repoUrl: string,
  prNumber: number,
): Promise<void> {
  if (isAgentRunning(agent.id)) return

  try {
    const details = await getPRDetails(repoUrl, prNumber)
    if (details.checks.length === 0) return

    const allCompleted = details.checks.every((c) => c.status === "completed")
    if (!allCompleted) return

    const failed = details.checks.filter((c) => c.conclusion === "failure")
    const conclusionKey = details.checks.map((c) => `${c.name}:${c.conclusion}`).sort().join(",")
    const lastKey = lastSeenCheckConclusions.get(agent.id)

    if (conclusionKey === lastKey) return
    lastSeenCheckConclusions.set(agent.id, conclusionKey)

    // Skip first run (seeding)
    if (!lastKey) return

    if (failed.length === 0) {
      // All checks passed — no action needed
      return
    }

    const failedNames = failed.map((c) => `- **${c.name}**${c.url ? ` ([view](${c.url}))` : ""}`).join("\n")
    const message = `CI checks failed on your PR:\n\n${failedNames}\n\nPlease investigate and fix the failing checks. If the failure is not related to your changes, explain why.`

    console.log(`[poller] ${agent.id}: CI failure detected, notifying agent`)
    await sendToAgent(agent.id, message, "CI Monitor")
  } catch (err) {
    console.warn(`[poller] CI monitor failed for ${agent.id}: ${(err as Error).message}`)
  }
}

// ── Merge conflict monitoring ────────────────────────────────────────────────

const lastSeenMergeableState = new Map<string, string>()

async function monitorMergeConflicts(
  agent: typeof agents.$inferSelect,
  pr: { mergeableState: string; number: number; url: string },
): Promise<void> {
  if (isAgentRunning(agent.id)) return

  const state = pr.mergeableState
  const lastState = lastSeenMergeableState.get(agent.id)
  lastSeenMergeableState.set(agent.id, state)

  // Skip first run (seeding)
  if (!lastState) return

  // Only notify when state changes TO dirty (merge conflict)
  if (state !== "dirty" || lastState === "dirty") return

  const message = `Your PR has merge conflicts. The base branch has changed since your last push.\n\nPlease resolve the conflicts:\n1. Rebase your branch onto the latest base branch: \`git fetch origin && git rebase origin/<base-branch>\`\n2. Fix any conflicts\n3. Force push: \`git push --force-with-lease\`\n\nIf the conflicts are complex, explain what files conflict and ask for guidance.`

  console.log(`[poller] ${agent.id}: merge conflict detected on PR #${pr.number}`)
  await sendToAgent(agent.id, message, "Merge Conflict")
}

// ── Send message to agent via local API ──────────────────────────────────────

async function sendToAgent(agentId: string, content: string, sender: string): Promise<void> {
  const body = JSON.stringify({ content, sender })
  await fetch(`http://127.0.0.1:${config.boundPort}/api/agents/${agentId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    },
    body,
  })
}

// ── Poller entrypoint ────────────────────────────────────────────────────────

export function startPoller(intervalMs?: number) {
  const effectiveInterval = intervalMs ?? getSettings().pollingIntervalMs ?? 60_000
  const SKIP_STATUSES = ["backlog", "cancelled", "done"]

  async function run() {
    const rows = db.select().from(agents)
      .where(and(notInArray(agents.status, SKIP_STATUSES), isNull(agents.deletedAt)))
      .all()

    console.log(`[poller] checking ${rows.length} agent(s)`)
    const CONCURRENCY = 5
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(pollAgent))
    }
  }

  // Periodic Jira sync (every 5 minutes)
  async function syncJira() {
    try {
      await fetch(`http://127.0.0.1:${config.boundPort}/api/tasks/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
        },
        body: JSON.stringify({}),
      })
    } catch { /* Jira not configured or unreachable */ }
  }

  // Clean up dead ports
  function cleanPorts() {
    try {
      const { getAllPortsFromDB } = require("./git/processes.js") as { getAllPortsFromDB: () => unknown[] }
      getAllPortsFromDB() // This checks and removes dead ports as a side effect
    } catch {}
  }

  // Run once shortly after startup, then on interval
  setTimeout(() => run().catch(console.error), 5_000)
  setInterval(() => run().catch(console.error), effectiveInterval)

  // Port cleanup: every 30s
  setInterval(cleanPorts, 30_000)

  // Jira sync: first run after 30s, then every 5 min
  setTimeout(() => syncJira(), 30_000)
  setInterval(() => syncJira(), 5 * 60_000)
}
