import { and, isNull, notInArray } from "drizzle-orm"
import { db } from "../../db/index.js"
import { agents } from "../../db/schema.js"
import { getSettings } from "../settings/settings.service.js"
import type { Job } from "../../jobTypes.js"
import { pollAgent } from "./job/pollAgent.js"

// Per-agent PR/CI/comment/merge-conflict monitor. Walks every non-terminal
// agent, syncs the branch from git, refreshes PR status, and fans out to the
// PR-comment / CI / merge-conflict sub-monitors (whose per-agent state lives
// in `./job/monitors.ts`).

const SKIP_STATUSES = ["backlog", "cancelled", "done"]
const CONCURRENCY = 5

async function runCycle(): Promise<void> {
  const rows = db.select().from(agents)
    .where(and(notInArray(agents.status, SKIP_STATUSES), isNull(agents.deletedAt)))
    .all()
  console.info(`[job] checking ${rows.length} agent(s)`)
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(pollAgent))
  }
}

export const pullRequestsJob: Job = {
  name: "pull-requests",
  start() {
    const interval = getSettings().pollingIntervalMs ?? 60_000
    // Run once shortly after startup, then on interval
    setTimeout(() => runCycle().catch(console.error), 5_000)
    setInterval(() => runCycle().catch(console.error), interval)
  },
}
