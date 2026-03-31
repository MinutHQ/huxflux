import { eq, notInArray } from "drizzle-orm"
import { db } from "./db/index.js"
import { agents, repos } from "./db/schema.js"
import { getPRStatus, findPRForBranch } from "./github/client.js"
import { getRemoteUrl } from "./git/worktrees.js"
import { broadcast } from "./ws/handler.js"
import type { PRStatus } from "./types.js"

function prStatusToAgentStatus(pr: PRStatus): string {
  if (pr.merged) return "done"
  if (pr.state === "closed") return "cancelled"
  if (pr.draft) return "in-progress"
  return "in-review"
}

async function pollAgent(agent: typeof agents.$inferSelect) {
  // Need a repo with a remote URL to query GitHub
  if (!agent.repoId) return
  const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
  if (!repo) return

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
  const SKIP_STATUSES = ["backlog", "cancelled"]

  async function run() {
    const rows = db.select().from(agents)
      .where(notInArray(agents.status, SKIP_STATUSES))
      .all()

    console.log(`[poller] checking ${rows.length} agent(s)`)
    for (const agent of rows) {
      await pollAgent(agent)
    }
  }

  // Run once shortly after startup, then on interval
  setTimeout(() => run().catch(console.error), 5_000)
  setInterval(() => run().catch(console.error), intervalMs)
}
