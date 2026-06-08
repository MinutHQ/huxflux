import { and, inArray, isNull, isNotNull } from "drizzle-orm"
import { db } from "../../db/index.js"
import { agents } from "../../db/schema.js"
import { getSettings } from "../settings/settings.service.js"
import type { Job } from "../../jobTypes.js"
import { pollAgent } from "./job/pollAgent.js"

const POLL_STATUSES = ["in-progress", "in-review"]
const CONCURRENCY = 3

let rateLimitedUntil = 0

export function markRateLimited(retryAfterSec = 60): void {
  const until = Date.now() + retryAfterSec * 1000
  if (until > rateLimitedUntil) rateLimitedUntil = until
}

export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil
}

async function runCycle(): Promise<void> {
  if (isRateLimited()) {
    const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000)
    console.info(`[job] GitHub rate-limited, skipping cycle (${waitSec}s remaining)`)
    return
  }

  const rows = db.select().from(agents)
    .where(and(
      inArray(agents.status, POLL_STATUSES),
      isNotNull(agents.repoId),
      isNull(agents.deletedAt),
    ))
    .all()

  if (rows.length === 0) return

  console.info(`[job] checking ${rows.length} agent(s)`)
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    if (isRateLimited()) {
      console.info(`[job] rate-limited mid-cycle, stopping early`)
      break
    }
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(pollAgent))
  }
}

export const pullRequestsJob: Job = {
  name: "pull-requests",
  start() {
    const interval = getSettings().pollingIntervalMs ?? 60_000
    setTimeout(() => runCycle().catch(console.error), 5_000)
    setInterval(() => runCycle().catch(console.error), interval)
  },
}
