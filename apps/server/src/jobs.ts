import type { Job } from "./jobTypes.js"
import { pullRequestsJob } from "./domains/pull-requests/pull-requests.job.js"
import { tasksJob } from "./domains/tasks/tasks.job.js"
import { agentsJob } from "./domains/agents/agents.job.js"

// Background-job registry. Each domain that needs periodic work appends
// its `Job` here. The server entrypoint calls `startJobs()` once, after
// migrations + reserve init + WS routes have all wired up.
export const jobs: Job[] = [
  pullRequestsJob,
  tasksJob,
  agentsJob,
]

export function startJobs(): void {
  for (const job of jobs) job.start()
}
