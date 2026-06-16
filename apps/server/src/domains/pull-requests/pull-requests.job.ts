import { and, inArray, isNull, isNotNull } from "drizzle-orm"
import { db } from "../../db/index.js"
import { agents } from "../../db/schema.js"
import { getSettings } from "../settings/settings.service.js"
import { logger } from "../../logger.js"
import type { Job } from "../../jobTypes.js"
import { pollAgent } from "./job/pollAgent.js"
import { isRateLimited, rateLimitWaitSec } from "./job/rateLimitState.js"

const POLL_STATUSES = ["in-progress", "in-review", "draft-pr"]
const CONCURRENCY = 3

async function runCycle(): Promise<void> {
  if (isRateLimited()) {
    logger.info({ waitSec: rateLimitWaitSec() }, "[job] GitHub rate-limited, skipping cycle")
    return
  }

  const startedAt = Date.now()
  const rows = db.select().from(agents)
    .where(and(
      inArray(agents.status, POLL_STATUSES),
      isNotNull(agents.repoId),
      isNull(agents.deletedAt),
    ))
    .all()

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

export const pullRequestsJob: Job = {
  name: "pull-requests",
  start() {
    const interval = getSettings().pollingIntervalMs ?? 60_000
    const onError = (err: unknown) => logger.error({ err }, "[job] poll cycle failed")
    setTimeout(() => runCycle().catch(onError), 5_000)
    setInterval(() => runCycle().catch(onError), interval)
  },
}
