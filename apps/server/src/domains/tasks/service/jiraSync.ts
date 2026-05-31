import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { tasks } from "../../../db/schema.js"
import type { JiraIssue } from "./jiraClient.js"
import * as jiraClient from "./jiraClient.js"
import { runAcli, runAcliView } from "./acli.js"
import { extractDescription } from "./adfToMarkdown.js"
import type { TaskStatus } from "../tasks.types.js"

export function mapJiraStatus(statusCategory: string): TaskStatus {
  const s = statusCategory.toLowerCase()
  if (s.includes("done")) return "done"
  if (s.includes("review")) return "in-review"
  if (s.includes("progress")) return "in-progress"
  return "backlog"
}

export function upsertIssue(issue: JiraIssue, parentId: string | null, now: string) {
  const f = issue.fields
  const existing = db.select().from(tasks).where(eq(tasks.jiraKey, issue.key)).get()

  const status = mapJiraStatus(f.status?.statusCategory?.name ?? f.status?.name ?? "")
  const values = {
    jiraKey: issue.key,
    title: f.summary ?? issue.key,
    description: extractDescription(f.description),
    status,
    priority: f.priority?.name?.toLowerCase() ?? null,
    assignee: f.assignee?.displayName ?? null,
    projectKey: f.project?.key ?? null,
    sprintName: f.sprint?.name ?? null,
    sprintState: f.sprint?.state ?? null,
    parentId,
    updatedAt: now,
  }

  if (existing) {
    db.update(tasks).set(values).where(eq(tasks.id, existing.id)).run()
  } else {
    db.insert(tasks).values({
      id: uuid(),
      ...values,
      sortOrder: 0,
      createdAt: now,
    }).run()
  }
}

interface PartitionedIssues {
  parents: JiraIssue[]
  subtasks: JiraIssue[]
}

export function partitionIssues(issues: JiraIssue[]): PartitionedIssues {
  const parents: JiraIssue[] = []
  const subtasks: JiraIssue[] = []
  for (const issue of issues) {
    if (issue.fields.issuetype?.subtask) {
      subtasks.push(issue)
    } else {
      parents.push(issue)
    }
  }
  return { parents, subtasks }
}

/**
 * For each subtask, find the parent issue key. The Jira REST API returns the
 * `parent.key` directly in search results; `acli` does not, so per-subtask
 * `acli ... view` calls are made instead. Returns the per-subtask parent key
 * map plus the deduped set of all parent keys encountered.
 */
export async function resolveSubtaskParents(
  subtasks: JiraIssue[],
  useApi: boolean,
): Promise<{ parentKeyBySubtask: Map<string, string>; allParentKeys: Set<string> }> {
  const parentKeyBySubtask = new Map<string, string>()
  const allParentKeys = new Set<string>()

  if (useApi) {
    for (const issue of subtasks) {
      const parentKey = issue.fields.parent?.key
      if (parentKey) {
        parentKeyBySubtask.set(issue.key, parentKey)
        allParentKeys.add(parentKey)
      }
    }
    return { parentKeyBySubtask, allParentKeys }
  }

  await Promise.all(subtasks.map(async (issue) => {
    try {
      const detail = await runAcliView(issue.key, "parent")
      const parentKey = detail?.fields?.parent?.key
      if (parentKey) {
        parentKeyBySubtask.set(issue.key, parentKey)
        allParentKeys.add(parentKey)
      }
    } catch { /* skip */ }
  }))
  return { parentKeyBySubtask, allParentKeys }
}

/** Fetch parent issues that weren't already returned by the original search. */
export async function fetchMissingParents(
  missingParentKeys: string[],
  useApi: boolean,
): Promise<JiraIssue[]> {
  if (missingParentKeys.length === 0) return []
  try {
    const jql = `key in (${missingParentKeys.join(",")})`
    return useApi ? await jiraClient.searchIssues(jql) : await runAcli(jql)
  } catch {
    return [] // best effort
  }
}

/**
 * After top-level parents have been synced, fetch their children that weren't
 * already in the original result set (e.g. subtasks the user hasn't been
 * assigned). Only available via the REST API — `parent in (...)` JQL isn't
 * supported on every Jira instance.
 */
export async function syncChildrenOfParents(
  parents: JiraIssue[],
  allSyncedKeys: Set<string>,
  useApi: boolean,
  now: string,
): Promise<void> {
  if (!useApi) return
  const parentKeys = parents.map((p) => p.key).filter((k) => k)
  if (parentKeys.length === 0) return
  try {
    const childJql = `parent in (${parentKeys.join(",")}) ORDER BY created ASC`
    const childIssues = await jiraClient.searchIssues(childJql, 100)
    for (const child of childIssues) {
      if (allSyncedKeys.has(child.key)) continue
      const parentKey = child.fields.parent?.key
      if (parentKey) {
        const parentRow = db.select().from(tasks).where(eq(tasks.jiraKey, parentKey)).get()
        upsertIssue(child, parentRow?.id ?? null, now)
      }
    }
  } catch { /* best effort — some Jira instances don't support parent in JQL */ }
}
