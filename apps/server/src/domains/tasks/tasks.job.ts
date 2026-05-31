import { config } from "../../config.js"
import type { Job } from "../../jobTypes.js"

// Periodic Jira sync. Hits the local sync endpoint instead of calling the
// service directly so route-level validation, auth, and audit logging all
// kick in. Skips silently when Jira is not configured (404 / network error).

async function syncJira(): Promise<void> {
  try {
    await fetch(`http://localhost:${config.boundPort}/api/tasks/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      },
      body: JSON.stringify({}),
    })
  } catch {
    /* Jira not configured or unreachable */
  }
}

export const tasksJob: Job = {
  name: "tasks-jira-sync",
  start() {
    // First run after 30s, then every 5 minutes
    setTimeout(() => syncJira(), 30_000)
    setInterval(() => syncJira(), 5 * 60_000)
  },
}
