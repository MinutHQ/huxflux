import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import { eq, isNull, asc } from "drizzle-orm"
import { execFile } from "node:child_process"
import { db } from "../db/index.js"
import * as jiraClient from "../jira/client.js"
import type { JiraIssue } from "../jira/client.js"
import { tasks, taskAgents, taskComments, taskDependencies, agents, repos } from "../db/schema.js"
import { broadcast } from "../ws/handler.js"
import { getProvider } from "../providers/index.js"
import { config } from "../config.js"
import { runClaude } from "../claude/runner.js"
import { getSettings } from "../settings.js"
import * as path from "node:path"
import * as os from "node:os"
type TaskStatus = "backlog" | "refining" | "ready" | "in-progress" | "in-review" | "done"

interface TaskCommentOut {
  id: string
  author: string
  role: "ai" | "user"
  content: string
  agentId?: string | null
  createdAt: string
}

interface TaskAgentOut {
  agentId: string
  agentTitle: string
  agentStatus: string
  agentBranch: string
}

interface TaskItemOut {
  id: string
  parentId: string | null
  jiraKey: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: string | null
  assignee: string | null
  projectKey: string | null
  repoId: string | null
  repoName: string | null
  refineAgentId: string | null
  agents: TaskAgentOut[]
  comments: TaskCommentOut[]
  subtasks: TaskItemOut[]
  dependencies: string[]
  sprintName: string | null
  sprintState: string | null
  createdAt: string
  updatedAt: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTaskTree(
  rows: (typeof tasks.$inferSelect)[],
  commentRows: (typeof taskComments.$inferSelect)[],
  agentRows: { taskId: string; agentId: string; title: string; status: string; branch: string }[],
  depRows: { taskId: string; dependsOnTaskId: string }[],
  refineAgentMap: Map<string, string>,
  repoMap: Map<string, string>,
): TaskItemOut[] {
  const commentsByTask = new Map<string, TaskCommentOut[]>()
  for (const c of commentRows) {
    const list = commentsByTask.get(c.taskId) ?? []
    list.push({ id: c.id, author: c.author, role: c.role as "ai" | "user", content: c.content, agentId: c.agentId, createdAt: c.createdAt })
    commentsByTask.set(c.taskId, list)
  }

  const agentsByTask = new Map<string, TaskAgentOut[]>()
  for (const a of agentRows) {
    const list = agentsByTask.get(a.taskId) ?? []
    list.push({ agentId: a.agentId, agentTitle: a.title, agentStatus: a.status as TaskAgentOut["agentStatus"], agentBranch: a.branch })
    agentsByTask.set(a.taskId, list)
  }

  const depsByTask = new Map<string, string[]>()
  for (const d of depRows) {
    const list = depsByTask.get(d.taskId) ?? []
    list.push(d.dependsOnTaskId)
    depsByTask.set(d.taskId, list)
  }

  const itemMap = new Map<string, TaskItemOut>()
  for (const row of rows) {
    itemMap.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      jiraKey: row.jiraKey,
      title: row.title,
      description: row.description,
      status: row.status as TaskItemOut["status"],
      priority: row.priority,
      assignee: row.assignee,
      projectKey: row.projectKey,
      repoId: row.repoId,
      repoName: row.repoId ? (repoMap.get(row.repoId) ?? null) : null,
      refineAgentId: refineAgentMap.get(row.id) ?? null,
      agents: agentsByTask.get(row.id) ?? [],
      comments: commentsByTask.get(row.id) ?? [],
      subtasks: [],
      dependencies: depsByTask.get(row.id) ?? [],
      sprintName: row.sprintName,
      sprintState: row.sprintState,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  // Build tree
  const roots: TaskItemOut[] = []
  for (const item of itemMap.values()) {
    if (item.parentId && itemMap.has(item.parentId)) {
      itemMap.get(item.parentId)!.subtasks.push(item)
    } else {
      roots.push(item)
    }
  }

  return roots
}

async function loadAllTasks(): Promise<TaskItemOut[]> {
  const allTasks = db.select().from(tasks).orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)).all()
  const allComments = db.select().from(taskComments).orderBy(asc(taskComments.createdAt)).all()
  const allAgentLinks = db
    .select({
      taskId: taskAgents.taskId,
      agentId: taskAgents.agentId,
      title: agents.title,
      status: agents.status,
      branch: agents.branch,
    })
    .from(taskAgents)
    .innerJoin(agents, eq(taskAgents.agentId, agents.id))
    .all()

  const allDeps = db.select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId }).from(taskDependencies).all()
  const allRepos = db.select({ id: repos.id, name: repos.name }).from(repos).all()
  const repoMap = new Map<string, string>(allRepos.map((r: { id: string; name: string }) => [r.id, r.name]))

  // Find hidden refine agents per task (agents with taskId set, not deleted)
  const refineAgentRows = db.select().from(agents).where(isNull(agents.deletedAt)).all()
  const refineAgentMap = new Map<string, string>()
  for (const a of refineAgentRows) {
    if (a.taskId) refineAgentMap.set(a.taskId, a.id)
  }

  return buildTaskTree(allTasks, allComments, allAgentLinks, allDeps, refineAgentMap, repoMap)
}

// ── Jira helpers ─────────────────────────────────────────────────────────────

function runAcliView(key: string, fields: string): Promise<JiraIssue> {
  return new Promise((resolve, reject) => {
    execFile("acli", ["jira", "workitem", "view", key, "--json", "--fields", fields], {
      timeout: 10_000,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Failed to parse acli view output`))
      }
    })
  })
}

function runAcli(jql: string, limit = 50): Promise<JiraIssue[]> {
  return new Promise((resolve, reject) => {
    execFile("acli", ["jira", "workitem", "search", "--jql", jql, "--json", "--limit", String(limit)], {
      timeout: 30_000,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Failed to parse acli output: ${stdout.slice(0, 200)}`))
      }
    })
  })
}

function mapJiraStatus(statusCategory: string): TaskStatus {
  const s = statusCategory.toLowerCase()
  if (s.includes("done")) return "done"
  if (s.includes("review")) return "in-review"
  if (s.includes("progress")) return "in-progress"
  return "backlog"
}

/** Convert Jira ADF (Atlassian Document Format) to Markdown */
function extractDescription(desc: any): string | null {
  if (!desc) return null
  if (typeof desc === "string") return desc
  if (desc.type === "doc" && Array.isArray(desc.content)) {
    return adfToMarkdown(desc.content).trim() || null
  }
  return null
}

function adfToMarkdown(nodes: any[], listDepth = 0): string {
  const parts: string[] = []

  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
        parts.push(adfInline(node.content ?? []))
        parts.push("\n\n")
        break
      case "heading": {
        const level = node.attrs?.level ?? 1
        parts.push("#".repeat(level) + " " + adfInline(node.content ?? []))
        parts.push("\n\n")
        break
      }
      case "bulletList":
        parts.push(adfList(node.content ?? [], "bullet", listDepth))
        if (listDepth === 0) parts.push("\n")
        break
      case "orderedList":
        parts.push(adfList(node.content ?? [], "ordered", listDepth))
        if (listDepth === 0) parts.push("\n")
        break
      case "listItem":
        // handled by adfList
        break
      case "codeBlock": {
        const lang = node.attrs?.language ?? ""
        const code = adfInline(node.content ?? [])
        parts.push("```" + lang + "\n" + code + "\n```\n\n")
        break
      }
      case "blockquote":
        const bqLines = adfToMarkdown(node.content ?? []).trim().split("\n")
        parts.push(bqLines.map((l: string) => "> " + l).join("\n"))
        parts.push("\n\n")
        break
      case "rule":
        parts.push("---\n\n")
        break
      case "table":
        parts.push(adfTable(node))
        parts.push("\n")
        break
      case "mediaSingle":
      case "media":
        parts.push("[media]\n\n")
        break
      default:
        if (Array.isArray(node.content)) {
          parts.push(adfToMarkdown(node.content, listDepth))
        }
    }
  }

  return parts.join("")
}

function adfInline(nodes: any[]): string {
  if (!nodes) return ""
  return nodes.map((n: any) => {
    if (n.type === "text") {
      let text = n.text ?? ""
      const marks: any[] = n.marks ?? []
      for (const mark of marks) {
        switch (mark.type) {
          case "strong": text = `**${text}**`; break
          case "em": text = `*${text}*`; break
          case "code": text = `\`${text}\``; break
          case "strike": text = `~~${text}~~`; break
          case "link": text = `[${text}](${mark.attrs?.href ?? ""})`; break
        }
      }
      return text
    }
    if (n.type === "hardBreak") return "\n"
    if (n.type === "mention") return `@${n.attrs?.text ?? "user"}`
    if (n.type === "emoji") return n.attrs?.shortName ?? ""
    if (n.type === "inlineCard") return n.attrs?.url ?? "[link]"
    return ""
  }).join("")
}

function adfList(items: any[], style: "bullet" | "ordered", depth: number): string {
  const parts: string[] = []
  const indent = "  ".repeat(depth)

  items.forEach((item: any, i: number) => {
    if (item.type !== "listItem") return
    const prefix = style === "bullet" ? "- " : `${i + 1}. `
    const content = item.content ?? []
    // First child is usually a paragraph — render inline
    const first = content[0]
    if (first?.type === "paragraph") {
      parts.push(indent + prefix + adfInline(first.content ?? []) + "\n")
    }
    // Remaining children (nested lists, etc.)
    for (let j = 1; j < content.length; j++) {
      parts.push(adfToMarkdown([content[j]], depth + 1))
    }
  })

  return parts.join("")
}

function adfTable(node: any): string {
  const rows: string[][] = []
  for (const row of node.content ?? []) {
    const cells: string[] = []
    for (const cell of row.content ?? []) {
      cells.push(adfToMarkdown(cell.content ?? []).trim().replace(/\n/g, " "))
    }
    rows.push(cells)
  }
  if (rows.length === 0) return ""
  const header = "| " + rows[0].join(" | ") + " |"
  const sep = "| " + rows[0].map(() => "---").join(" | ") + " |"
  const body = rows.slice(1).map((r) => "| " + r.join(" | ") + " |").join("\n")
  return [header, sep, body].filter(Boolean).join("\n") + "\n"
}

function upsertIssue(issue: JiraIssue, parentId: string | null, now: string) {
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

// ── Routes ───────────────────────────────────────────────────────────────────

export async function tasksRoutes(app: FastifyInstance) {
  // List all tasks (tree)
  app.get("/api/tasks", async () => {
    return loadAllTasks()
  })

  // Create a task
  app.post("/api/tasks", async (req) => {
    const { title, description, status, priority, assignee, projectKey, parentId, jiraKey } = req.body as {
      title: string
      description?: string
      status?: string
      priority?: string
      assignee?: string
      projectKey?: string
      parentId?: string
      jiraKey?: string
    }

    const now = new Date().toISOString()
    const id = uuid()

    // Get sort order: max + 1 for siblings
    const siblings = parentId
      ? db.select().from(tasks).where(eq(tasks.parentId, parentId)).all()
      : db.select().from(tasks).where(isNull(tasks.parentId)).all()
    const maxOrder = siblings.reduce((max: number, s: { sortOrder: number }) => Math.max(max, s.sortOrder), -1)

    db.insert(tasks).values({
      id,
      parentId: parentId ?? null,
      jiraKey: jiraKey ?? null,
      title,
      description: description ?? null,
      status: status ?? "backlog",
      priority: priority ?? null,
      assignee: assignee ?? null,
      projectKey: projectKey ?? null,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    }).run()

    return loadAllTasks()
  })

  // Update a task
  app.patch("/api/tasks/:id", async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{
      title: string
      description: string | null
      status: string
      priority: string | null
      assignee: string | null
      projectKey: string | null
      jiraKey: string | null
      sortOrder: number
    }>

    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!existing) return { error: "not found" }

    const wasReady = existing.status === "ready"
    db.update(tasks).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(eq(tasks.id, id)).run()

    // Auto-create agent when task moves to "ready" and has a repo
    if (body.status === "ready" && !wasReady) {
      const updated = db.select().from(tasks).where(eq(tasks.id, id)).get()
      if (updated?.repoId) {
        // Check if there's already a linked agent
        const existingAgent = db.select().from(taskAgents).where(eq(taskAgents.taskId, id)).all()
        if (existingAgent.length === 0) {
          try {
            // Fire start-work via internal HTTP to reuse full agent creation logic
            await fetch(`http://localhost:${config.boundPort}/api/tasks/${id}/start-work`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
              },
              body: JSON.stringify({}),
            })
          } catch (err) {
            console.error(`[tasks] auto-start failed for ${id}:`, err)
          }
        }
      }
    }

    return loadAllTasks()
  })

  // Delete a task (and all subtasks via cascade)
  app.delete("/api/tasks/:id", async (req) => {
    const { id } = req.params as { id: string }

    // Delete subtasks recursively (SQLite cascade handles task_agents and task_comments)
    function deleteRecursive(taskId: string) {
      const children = db.select().from(tasks).where(eq(tasks.parentId, taskId)).all()
      for (const child of children) deleteRecursive(child.id)
      db.delete(tasks).where(eq(tasks.id, taskId)).run()
    }
    deleteRecursive(id)

    return loadAllTasks()
  })

  // Link an agent to a task
  app.post("/api/tasks/:id/agents", async (req) => {
    const { id: taskId } = req.params as { id: string }
    const { agentId } = req.body as { agentId: string }

    // Check both exist
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()
    if (!task || !agent) return { error: "not found" }

    // Upsert (ignore if already linked)
    const existing = db.select().from(taskAgents).where(eq(taskAgents.taskId, taskId)).all()
    if (!existing.some((e: { agentId: string }) => e.agentId === agentId)) {
      db.insert(taskAgents).values({ id: uuid(), taskId, agentId }).run()
    }

    return loadAllTasks()
  })

  // Unlink an agent
  app.delete("/api/tasks/:taskId/agents/:agentId", async (req) => {
    const { taskId, agentId } = req.params as { taskId: string; agentId: string }
    const rows = db.select().from(taskAgents).where(eq(taskAgents.taskId, taskId)).all()
    const match = rows.find((r: { agentId: string }) => r.agentId === agentId)
    if (match) db.delete(taskAgents).where(eq(taskAgents.id, match.id)).run()
    return loadAllTasks()
  })

  // Add a comment
  app.post("/api/tasks/:id/comments", async (req) => {
    const { id: taskId } = req.params as { id: string }
    const { author, role, content } = req.body as { author: string; role: string; content: string }

    db.insert(taskComments).values({
      id: uuid(),
      taskId,
      author,
      role,
      content,
      createdAt: new Date().toISOString(),
    }).run()

    return loadAllTasks()
  })

  // ── Jira Sync ────────────────────────────────────────────────────────────

  app.post("/api/tasks/sync", async (req) => {
    const { jql } = (req.body ?? {}) as { jql?: string }
    const defaultJql = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
    const query = jql || defaultJql

    const useApi = jiraClient.isJiraApiConfigured()

    let issues: JiraIssue[]
    try {
      if (useApi) {
        // Jira REST API — returns parent field in one request
        issues = await jiraClient.searchIssues(query)
      } else {
        // Fallback to acli
        issues = await runAcli(query)
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      if (msg.includes("not logged in") || msg.includes("auth") || msg.includes("401")) {
        return { error: "Jira not authenticated. " + (useApi ? "Check your API token in settings." : "Run `acli jira auth` to connect.") }
      }
      if (msg.includes("ENOENT") || msg.includes("not found")) {
        return { error: "acli not installed. Configure Jira API credentials in settings instead." }
      }
      return { error: `Jira sync failed: ${msg}` }
    }

    const now = new Date().toISOString()

    // Separate parents from subtasks
    const parents: JiraIssue[] = []
    const subtasks: JiraIssue[] = []

    for (const issue of issues) {
      if (issue.fields.issuetype?.subtask) {
        subtasks.push(issue)
      } else {
        parents.push(issue)
      }
    }

    // Resolve parent keys for subtasks
    const parentKeyBySubtask = new Map<string, string>()
    const allParentKeys = new Set<string>()

    if (useApi) {
      // API returns parent.key directly in search results
      for (const issue of subtasks) {
        const parentKey = issue.fields.parent?.key
        if (parentKey) {
          parentKeyBySubtask.set(issue.key, parentKey)
          allParentKeys.add(parentKey)
        }
      }
    } else {
      // acli: need per-subtask view calls to get parent
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
    }

    // Fetch parent issues not already in results
    const fetchedParentKeys = new Set(parents.map((p) => p.key))
    const missingParentKeys = [...allParentKeys].filter((k) => !fetchedParentKeys.has(k))
    if (missingParentKeys.length > 0) {
      try {
        if (useApi) {
          const parentIssues = await jiraClient.searchIssues(`key in (${missingParentKeys.join(",")})`)
          parents.push(...parentIssues)
        } else {
          const parentIssues = await runAcli(`key in (${missingParentKeys.join(",")})`)
          parents.push(...parentIssues)
        }
      } catch { /* best effort */ }
    }

    // Pass 1: upsert parents
    for (const issue of parents) {
      upsertIssue(issue, null, now)
    }

    // Pass 2: upsert subtasks linked to parents
    for (const issue of subtasks) {
      const parentKey = parentKeyBySubtask.get(issue.key) ?? null
      let parentId: string | null = null
      if (parentKey) {
        const parentRow = db.select().from(tasks).where(eq(tasks.jiraKey, parentKey)).get()
        parentId = parentRow?.id ?? null
      }
      upsertIssue(issue, parentId, now)
    }

    // Pass 3: fetch children of parent tasks that weren't in the original results
    const allSyncedKeys = new Set([...parents.map((p) => p.key), ...subtasks.map((s) => s.key)])
    const parentKeysToFetchChildren = parents.map((p) => p.key).filter((k) => k)
    if (parentKeysToFetchChildren.length > 0 && useApi) {
      try {
        const childJql = `parent in (${parentKeysToFetchChildren.join(",")}) ORDER BY created ASC`
        const childIssues = await jiraClient.searchIssues(childJql, 100)
        for (const child of childIssues) {
          if (allSyncedKeys.has(child.key)) continue // already synced
          const parentKey = child.fields.parent?.key
          if (parentKey) {
            const parentRow = db.select().from(tasks).where(eq(tasks.jiraKey, parentKey)).get()
            upsertIssue(child, parentRow?.id ?? null, now)
          }
        }
      } catch { /* best effort — some Jira instances don't support parent in JQL */ }
    }

    return loadAllTasks()
  })

  // Transition a task's Jira status
  app.post("/api/tasks/:id/jira-transition", async (req) => {
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: string }

    const task = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!task?.jiraKey) return { error: "Task has no Jira key" }

    const useApi = jiraClient.isJiraApiConfigured()

    try {
      if (useApi) {
        await jiraClient.transitionIssue(task.jiraKey!, status)
      } else {
        await new Promise<void>((resolve, reject) => {
          execFile("acli", ["jira", "workitem", "transition", "--key", task.jiraKey!, "--status", status, "--yes"], (err, _stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message))
            else resolve()
          })
        })
      }
    } catch (err: any) {
      return { error: `Transition failed: ${err.message}`, localUpdated: true }
    }

    return { ok: true }
  })

  // Test Jira API connection

  // ── Refinement Chat ─────────────────────────────────────────────────────
  // Uses a hidden internal agent (taskId set, filtered from sidebar) for full
  // streaming + tool calls. The agent is auto-created on first message and
  // reused for follow-ups via session resume.

  function getOrCreateRefineAgent(taskId: string): { agentId: string; cwd: string } {
    // Use a repo path as CWD so Claude has a valid project context.
    // Prefer the task's repo, fall back to first available repo, then homedir.
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()!
    const allRepos = db.select().from(repos).all()
    const targetRepo = task.repoId
      ? allRepos.find((r: { id: string }) => r.id === task.repoId) ?? allRepos[0]
      : allRepos[0]
    const cwd = (targetRepo as any)?.path ?? os.homedir()

    // Check if a refine agent already exists for this task
    const existing = db.select().from(agents)
      .where(eq(agents.taskId, taskId))
      .all()
      .find((a: { deletedAt: string | null }) => !a.deletedAt)

    if (existing) {
      return { agentId: existing.id, cwd }
    }

    // Create new hidden refine agent
    const agentId = uuid()
    const now = new Date().toISOString()
    const settings = getSettings()

    db.insert(agents).values({
      id: agentId,
      repoId: (targetRepo as any)?.id ?? null,
      title: `Refine: ${task.title.slice(0, 40)}`,
      status: "in-progress",
      branch: "main",
      model: settings.defaultModel ?? "Sonnet 4.6",
      location: `refine-${taskId.slice(0, 8)}-${Date.now()}`,
      noWorktree: 1,
      provider: settings.defaultProvider ?? "claude",
      taskId,
      createdAt: now,
      updatedAt: now,
    }).run()

    return { agentId, cwd }
  }

  function buildTaskContext(task: typeof tasks.$inferSelect, taskId: string): string {
    const subtaskRows = db.select().from(tasks).where(eq(tasks.parentId, taskId)).all()
    const parentRow = task.parentId ? db.select().from(tasks).where(eq(tasks.id, task.parentId)).get() : null
    const allRepos = db.select().from(repos).all()
    const repoList = allRepos.map((r: { name: string; path: string }) => `- ${r.name}: ${r.path}`).join("\n")

    return [
      `You are helping refine a task: "${task.title}"${task.jiraKey ? ` (${task.jiraKey})` : ""}.`,
      task.description ? `\nCurrent description:\n${task.description}` : "",
      subtaskRows.length > 0 ? `\nCurrent subtasks:\n${subtaskRows.map((s: { title: string; id: string }) => `- [${s.id}] ${s.title}`).join("\n")}` : "",
      parentRow ? `\nThis is a subtask of: "${parentRow.title}". You can only modify this subtask, not the parent.` : "",
      `\nAvailable repositories (use absolute paths to explore any of them):`,
      repoList || "(none configured)",
      ``,
      `IMPORTANT: You MUST use these XML tags to make changes to the task. Do NOT just describe changes in text — actually emit the tags so they are applied automatically:`,
      ``,
      `To update the description:`,
      `<huxflux:task-update taskId="${taskId}" field="description">`,
      `The full new description in markdown goes here.`,
      `</huxflux:task-update>`,
      ``,
      `To create a subtask:`,
      `<huxflux:task-create parentId="${taskId}">{"title":"Subtask title","description":"Subtask description in markdown"}</huxflux:task-create>`,
      ``,
      `To mark the task as ready (done refining):`,
      `<huxflux:task-status taskId="${taskId}" status="ready"/>`,
      ``,
      `You can emit multiple tags in a single response. Tags are processed and stripped from the displayed message.`,
      `After making changes, briefly explain what you did in plain text.`,
      ``,
      `All task context is provided above — do NOT use acli, jira, or other external tools to fetch task information.`,
      `Focus on exploring the codebase using the repo paths above.`,
    ].filter(Boolean).join("\n")
  }

  app.post("/api/tasks/:id/reply", async (req) => {
    const { id: taskId } = req.params as { id: string }
    const { content } = req.body as { content: string }
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!task) return { error: "Task not found" }

    // Get or create the hidden refine agent
    const { agentId, cwd } = getOrCreateRefineAgent(taskId)
    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()!

    // Send via runClaude — it persists the user message + streams the response
    // No dual-write to task_comments — the agent's messages table is the source of truth
    runClaude(content, {
      agentId,
      worktreePath: cwd,
      model: agent.model,
      provider: agent.provider,
      taskContext: buildTaskContext(task, taskId),
    }).catch((err: any) => {
      console.error(`[task:refine] runClaude failed:`, err?.message ?? err)
    })

    return { agentId, tasks: await loadAllTasks() }
  })

  // ── Start Working Agent ─────────────────────────────────────────────────

  app.post("/api/tasks/:id/start-work", async (req) => {
    const { id: taskId } = req.params as { id: string }
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!task) return { error: "Task not found" }
    if (!task.repoId) return { error: "Task has no repo assigned — set a repo first" }

    const repo = db.select().from(repos).where(eq(repos.id, task.repoId)).get()
    if (!repo) return { error: "Repo not found" }

    // Build context from task + comments
    const comments = db.select().from(taskComments).where(eq(taskComments.taskId, taskId)).all()
    const commentContext = comments.length > 0
      ? "\n\nRefinement thread:\n" + comments.map((c: { author: string; content: string }) => `${c.author}: ${c.content}`).join("\n\n")
      : ""

    // Get parent task context if subtask
    let parentContext = ""
    if (task.parentId) {
      const parent = db.select().from(tasks).where(eq(tasks.id, task.parentId)).get()
      if (parent) {
        parentContext = `\n\nParent task: ${parent.title}${parent.description ? `\n${parent.description}` : ""}`
      }
    }

    const slug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)
    const branch = `task/${taskId.slice(0, 8)}/${slug}`
    const agentId = uuid()
    const now = new Date().toISOString()
    const settings = getSettings()
    const agentLocation = `task-${taskId.slice(0, 8)}-${Date.now()}`

    // Create agent with worktree — this is done via internal HTTP to reuse full worktree creation logic
    db.insert(agents).values({
      id: agentId,
      repoId: task.repoId,
      title: task.title.slice(0, 60),
      status: "in-progress",
      branch,
      model: settings.defaultModel ?? "Sonnet 4.6",
      location: agentLocation,
      provider: settings.defaultProvider ?? "claude",
      taskId,
      createdAt: now,
      updatedAt: now,
    }).run()

    // Link agent to task
    db.insert(taskAgents).values({ id: uuid(), taskId, agentId }).run()

    // Update task status
    db.update(tasks).set({ status: "in-progress", updatedAt: now }).where(eq(tasks.id, taskId)).run()
    broadcast({ type: "task:updated", taskId })

    const systemPrompt = `You are working on: ${task.title}${task.jiraKey ? ` (${task.jiraKey})` : ""}

${task.description ?? "No description provided."}
${parentContext}
${commentContext}

If you have questions or encounter blockers, post them via:
<huxflux:task-comment taskId="${taskId}">your question</huxflux:task-comment>

When the task is complete, signal it via:
<huxflux:task-status taskId="${taskId}" status="done"/>`

    const worktreePath = path.join(repo.workspacesPath, agentLocation)

    // Create worktree
    try {
      const { createWorktree } = await import("../git/worktrees.js")
      await createWorktree(repo.path, branch, worktreePath, task.projectKey ? `origin/${task.projectKey}` : repo.branchFrom)
    } catch (err: any) {
      // Clean up agent if worktree fails
      db.delete(agents).where(eq(agents.id, agentId)).run()
      db.delete(taskAgents).where(eq(taskAgents.agentId, agentId)).run()
      return { error: `Failed to create worktree: ${err.message}` }
    }

    // Send initial message
    runClaude(`Implement the following task:\n\n${task.description ?? task.title}`, {
      agentId,
      worktreePath,
      model: settings.defaultModel,
      provider: settings.defaultProvider,
    })

    return { agentId, tasks: await loadAllTasks() }
  })

  // ── Dependencies ────────────────────────────────────────────────────────

  app.post("/api/tasks/:id/dependencies", async (req) => {
    const { id: taskId } = req.params as { id: string }
    const { dependsOnTaskId } = req.body as { dependsOnTaskId: string }

    // Validate both tasks exist and are siblings
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
    const dep = db.select().from(tasks).where(eq(tasks.id, dependsOnTaskId)).get()
    if (!task || !dep) return { error: "Task not found" }
    if (task.parentId !== dep.parentId) return { error: "Dependencies must be between sibling tasks" }
    if (taskId === dependsOnTaskId) return { error: "Task cannot depend on itself" }

    // Check for existing
    const existing = db.select().from(taskDependencies).where(eq(taskDependencies.taskId, taskId)).all()
    if (existing.some((e: { dependsOnTaskId: string }) => e.dependsOnTaskId === dependsOnTaskId)) {
      return loadAllTasks() // already exists
    }

    db.insert(taskDependencies).values({ id: uuid(), taskId, dependsOnTaskId }).run()
    broadcast({ type: "task:updated", taskId })
    return loadAllTasks()
  })

  app.delete("/api/tasks/:taskId/dependencies/:depId", async (req) => {
    const { taskId, depId } = req.params as { taskId: string; depId: string }
    db.delete(taskDependencies).where(eq(taskDependencies.id, depId)).run()
    broadcast({ type: "task:updated", taskId })
    return loadAllTasks()
  })

  // ── Jira Status ─────────────────────────────────────────────────────────

  app.get("/api/tasks/jira-status", async () => {
    const useApi = jiraClient.isJiraApiConfigured()
    if (useApi) {
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
