import { and, isNull, notInArray } from "drizzle-orm"
import { db } from "../../db/index.js"
import { agents } from "../../db/schema.js"
import { getSettings } from "../settings/settings.service.js"
import { logger } from "../../logger.js"
import type { Job } from "../../jobTypes.js"
import { pollAgent } from "./job/pollAgent.js"

// Per-agent PR/CI/comment/merge-conflict monitor. Walks every non-terminal
// agent, syncs the branch from git, refreshes PR status, and fans out to the
// PR-comment / CI / merge-conflict sub-monitors (whose per-agent state lives
// in `./job/monitors.ts`).

const SKIP_STATUSES = ["backlog", "cancelled", "done"]
const CONCURRENCY = 5

async function runCycle(): Promise<void> {
  const startedAt = Date.now()
  const rows = db.select().from(agents)
    .where(and(notInArray(agents.status, SKIP_STATUSES), isNull(agents.deletedAt)))
    .all()
  logger.info(
    { agentCount: rows.length, batchSize: CONCURRENCY },
    "[job] polling agents for PR status, CI, review comments and merge conflicts",
  )
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(pollAgent))
  }
  logger.info(
    { agentCount: rows.length, durationMs: Date.now() - startedAt },
    "[job] poll cycle complete",
  )
}

export const pullRequestsJob: Job = {
  name: "pull-requests",
  start() {
    const interval = getSettings().pollingIntervalMs ?? 60_000
    const onError = (err: unknown) => logger.error({ err }, "[job] poll cycle failed")
    // Run once shortly after startup, then on interval
    setTimeout(() => runCycle().catch(onError), 5_000)
    setInterval(() => runCycle().catch(onError), interval)
  },
}
