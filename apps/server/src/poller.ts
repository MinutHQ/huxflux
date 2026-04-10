import { eq, notInArray, isNull, and } from "drizzle-orm"
import { simpleGit } from "simple-git"
import * as path from "node:path"
import { db } from "./db/index.js"
import { agents, repos } from "./db/schema.js"
import { getPRStatus, findPRForBranch } from "./github/client.js"
import { getRemoteUrl } from "./git/worktrees.js"
import { broadcast } from "./ws/handler.js"
import { prStatusToAgentStatus } from "./github/prStatus.js"
import type { PRStatus } from "./types.js"

async function pollAgent(agent: typeof agents.$inferSelect) {
  // Need a repo with a remote URL to query GitHub
  if (!agent.repoId) return
  if (!agent.branch) return // skip agents with empty branch
  const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
  if (!repo) return

  // Sync branch name from actual git worktree (Claude may have renamed it)
  if (!agent.noWorktree) {
    try {
      const worktreePath = path.join(repo.workspacesPath, agent.location)
      const actualBranch = (await simpleGit(worktreePath).revparse(["--abbrev-ref", "HEAD"])).trim()
      if (actualBranch && actualBranch !== agent.branch) {
        db.update(agents).set({ branch: actualBranch, updatedAt: new Date().toISOString() }).where(eq(agents.id, agent.id)).run()
        agent = { ...agent, branch: actualBranch }
        const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
        if (updated) broadcast({ type: "agent:updated", agent: updated as any })
      }
    } catch { /* worktree may not exist */ }
  }

  // Resolve GitHub URL from git remote (repo.remote is the remote name, e.g. "origin")
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

    // Only update if something changed
    const statusChanged = newStatus !== agent.status
    const prChanged = prStatusJson !== agent.prStatus || pr.number !== agent.prNumber

    if (!statusChanged && !prChanged) return

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
      broadcast({
        type: "agent:updated",
        agent: { ...updated, prStatus: pr } as any,
      })
    }
  } catch (err) {
    // GitHub token missing, rate limited, or repo not on GitHub — skip silently
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[poller] ${agent.id}: ${(err as Error).message}`)
    }
  }
}

export function startPoller(intervalMs = 60_000) {
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

  // Run once shortly after startup, then on interval
  setTimeout(() => run().catch(console.error), 5_000)
  setInterval(() => run().catch(console.error), intervalMs)
}
