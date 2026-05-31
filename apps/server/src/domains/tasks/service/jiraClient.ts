import { getSettings } from "../../settings/settings.service.js"

interface JiraSearchResult {
  issues: JiraIssue[]
  total: number
  startAt: number
  maxResults: number
}

export interface JiraIssue {
  key: string
  fields: {
    summary?: string
    description?: unknown
    status?: { name?: string; statusCategory?: { name?: string } }
    priority?: { name?: string }
    assignee?: { displayName?: string }
    issuetype?: { name?: string; subtask?: boolean }
    parent?: { key?: string; fields?: { summary?: string; issuetype?: { name?: string } } }
    project?: { key?: string }
    sprint?: { id?: number; name?: string; state?: string } | null
    [key: string]: unknown  // custom fields (e.g. sprint)
  }
}

interface JiraTransition {
  id: string
  name: string
  to: { name: string }
}

function getAuth(): { baseUrl: string; headers: Record<string, string> } | null {
  const { jiraBaseUrl, jiraEmail, jiraApiToken } = getSettings()
  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) return null
  const base = jiraBaseUrl.replace(/\/+$/, "")
  const token = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString("base64")
  return {
    baseUrl: base,
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  }
}

export function isJiraApiConfigured(): boolean {
  return getAuth() !== null
}

let cachedSprintFieldId: string | null = null

async function getSprintFieldId(): Promise<string | null> {
  if (cachedSprintFieldId) return cachedSprintFieldId
  const auth = getAuth()
  if (!auth) return null
  try {
    const res = await fetch(`${auth.baseUrl}/rest/api/3/field`, { headers: auth.headers })
    if (!res.ok) return null
    const fields = (await res.json()) as { key: string; name: string }[]
    const sprint = fields.find((f) => f.name === "Sprint")
    cachedSprintFieldId = sprint?.key ?? null
    return cachedSprintFieldId
  } catch {
    return null
  }
}

export async function searchIssues(jql: string, maxResults = 50): Promise<JiraIssue[]> {
  const auth = getAuth()
  if (!auth) throw new Error("Jira API not configured")

  const sprintFieldId = await getSprintFieldId()
  const fields = ["summary", "status", "priority", "assignee", "issuetype", "parent", "project", "description", ...(sprintFieldId ? [sprintFieldId] : [])]
  const url = `${auth.baseUrl}/rest/api/3/search/jql`

  const res = await fetch(url, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify({ jql, fields, maxResults }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    if (res.status === 401) throw new Error("Jira authentication failed. Check your email and API token.")
    if (res.status === 403) throw new Error("Jira access denied. Your API token may lack permissions.")
    throw new Error(`Jira API error ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as JiraSearchResult

  // Normalize sprint custom field into sprint
  if (sprintFieldId) {
    for (const issue of data.issues) {
      normalizeSprintField(issue, sprintFieldId)
    }
  }

  return data.issues
}

type SprintEntry = { id?: number; name?: string; state?: string }

function normalizeSprintField(issue: JiraIssue, sprintFieldId: string): void {
  const raw = issue.fields[sprintFieldId]
  if (!issue.fields.sprint && Array.isArray(raw)) {
    const arr = raw as SprintEntry[]
    const active = arr.find((s) => s.state === "active")
    issue.fields.sprint = active ?? arr[arr.length - 1] ?? null
  } else if (!issue.fields.sprint && raw && typeof raw === "object") {
    issue.fields.sprint = raw as SprintEntry
  }
}

export async function transitionIssue(issueKey: string, targetStatus: string): Promise<void> {
  const auth = getAuth()
  if (!auth) throw new Error("Jira API not configured")

  // First, get available transitions
  const transUrl = `${auth.baseUrl}/rest/api/3/issue/${issueKey}/transitions`
  const transRes = await fetch(transUrl, { headers: auth.headers })
  if (!transRes.ok) throw new Error(`Failed to get transitions for ${issueKey}`)

  const { transitions } = (await transRes.json()) as { transitions: JiraTransition[] }
  const match = transitions.find((t) => t.name.toLowerCase() === targetStatus.toLowerCase() || t.to.name.toLowerCase() === targetStatus.toLowerCase())
  if (!match) {
    const available = transitions.map((t) => t.name).join(", ")
    throw new Error(`No transition to "${targetStatus}" found for ${issueKey}. Available: ${available}`)
  }

  // Execute the transition
  const execRes = await fetch(transUrl, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify({ transition: { id: match.id } }),
  })
  if (!execRes.ok) {
    const body = await execRes.text().catch(() => "")
    throw new Error(`Transition failed for ${issueKey}: ${body.slice(0, 200)}`)
  }
}

export async function testConnection(): Promise<{ ok: boolean; displayName?: string; error?: string }> {
  const auth = getAuth()
  if (!auth) return { ok: false, error: "Jira API credentials not configured" }

  try {
    const res = await fetch(`${auth.baseUrl}/rest/api/3/myself`, { headers: auth.headers })
    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: "Invalid credentials" }
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const data = (await res.json()) as { displayName?: string }
    return { ok: true, displayName: data.displayName }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
