import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { execFile } from "node:child_process"
import { syncTasksBodySchema, transitionTaskBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { tasks } from "../../../db/schema.js"
import * as jiraClient from "../service/jiraClient.js"
import type { JiraIssue } from "../service/jiraClient.js"
import { runAcli } from "../service/acli.js"
import {
  upsertIssue,
  partitionIssues,
  resolveSubtaskParents,
  fetchMissingParents,
  syncChildrenOfParents,
} from "../service/jiraSync.js"
import { loadAllTasks } from "../service/loadTasks.js"

const DEFAULT_JQL = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"

const idParamsSchema = z.object({ id: z.string() })

/** Jira sync + transition + connectivity-status endpoints. */
export const jiraRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/api/tasks/sync", {
    // The body is optional — legacy clients call this without one. Fastify
    // passes `null` when no body is sent (Content-Type missing) and parses
    // `{}` otherwise; accept both forms by making the body schema nullish.
    schema: { body: syncTasksBodySchema.nullish() },
  }, async (req) => {
    const body = req.body ?? {}
    const query = body.jql || DEFAULT_JQL
    const useApi = jiraClient.isJiraApiConfigured()

    const fetched = await fetchInitialIssues(query, useApi)
    if ("error" in fetched) return fetched

    await runJiraSync(fetched.issues, useApi)
    return loadAllTasks()
  })

  app.post("/api/tasks/:id/jira-transition", {
    schema: { params: idParamsSchema, body: transitionTaskBodySchema },
  }, async (req) => {
    const { id } = req.params
    const { status } = req.body

    const task = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!task?.jiraKey) return { error: "Task has no Jira key" }

    try {
      if (jiraClient.isJiraApiConfigured()) {
        await jiraClient.transitionIssue(task.jiraKey, status)
      } else {
        await transitionViaAcli(task.jiraKey, status)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: `Transition failed: ${message}`, localUpdated: true }
    }
    return { ok: true }
  })

  app.get("/api/tasks/jira-status", async () => {
    if (jiraClient.isJiraApiConfigured()) {
      const result = await jiraClient.testConnection()
      return { method: "api", ...result }
    }
    // Check if acli is available
    try {
      await new Promise<void>((resolve, reject) => {
        execFile("acli", ["--version"], { timeout: 5000 }, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      return { method: "acli", ok: true }
    } catch {
      return { method: "none", ok: false, error: "Neither Jira API nor acli configured" }
    }
  })
}

/** Run the JQL and return the issue list, or a serializable error object. */
async function fetchInitialIssues(
  query: string,
  useApi: boolean,
): Promise<{ issues: JiraIssue[] } | { error: string }> {
  try {
    const issues = useApi ? await jiraClient.searchIssues(query) : await runAcli(query)
    return { issues }
  } catch (err) {
    return { error: classifyJiraError(err, useApi) }
  }
}

function classifyJiraError(err: unknown, useApi: boolean): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes("not logged in") || msg.includes("auth") || msg.includes("401")) {
    return "Jira not authenticated. " + (useApi ? "Check your API token in settings." : "Run `acli jira auth` to connect.")
  }
  if (msg.includes("ENOENT") || msg.includes("not found")) {
    return "acli not installed. Configure Jira API credentials in settings instead."
  }
  return `Jira sync failed: ${msg}`
}

/**
 * Three-pass sync: parents → subtasks (linked to parents) → children of any
 * parent task that wasn't already returned in the original search. Mirrors
 * the legacy route exactly.
 */
async function runJiraSync(issues: JiraIssue[], useApi: boolean): Promise<void> {
  const now = new Date().toISOString()
  const { parents, subtasks } = partitionIssues(issues)
  const { parentKeyBySubtask, allParentKeys } = await resolveSubtaskParents(subtasks, useApi)

  // Fetch parent issues not already in results
  const fetchedParentKeys = new Set(parents.map((p) => p.key))
  const missingParentKeys = [...allParentKeys].filter((k) => !fetchedParentKeys.has(k))
  const extraParents = await fetchMissingParents(missingParentKeys, useApi)
  parents.push(...extraParents)

  // Pass 1: parents
  for (const issue of parents) upsertIssue(issue, null, now)

  // Pass 2: subtasks linked to parents
  for (const issue of subtasks) {
    const parentKey = parentKeyBySubtask.get(issue.key) ?? null
    let parentId: string | null = null
    if (parentKey) {
      const parentRow = db.select().from(tasks).where(eq(tasks.jiraKey, parentKey)).get()
      parentId = parentRow?.id ?? null
    }
    upsertIssue(issue, parentId, now)
  }

  // Pass 3: children of parent tasks that weren't in the original results
  const allSyncedKeys = new Set([...parents.map((p) => p.key), ...subtasks.map((s) => s.key)])
  await syncChildrenOfParents(parents, allSyncedKeys, useApi, now)
}

function transitionViaAcli(jiraKey: string, status: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile("acli", ["jira", "workitem", "transition", "--key", jiraKey, "--status", status, "--yes"], (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve()
    })
  })
}
