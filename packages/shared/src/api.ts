import { getActiveServer } from "./serverStore"
import type {
  Agent,
  AgentSummary,
  FileChange,
  Message,
  Repo,
  SlashCommand,
  PRStatus,
  PRDetails,
  OpenPRWithRepo,
  PRFileDiff,
  PRChatMessage,
} from "./types"

export interface WrappedSummary {
  summary: string
  periodKey: string
  cached: boolean
}

export interface WorkspaceStats {
  agents: { total: number; active: number; deleted: number }
  messages: { total: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  toolCalls: number
  fileChanges: { total: number; additions: number; deletions: number }
  repos: number
  dailyAgents: { date: string; count: number }[]
}

function getBase(): string {
  return getActiveServer()?.url ?? "http://localhost:4321"
}

function authHeaders(): Record<string, string> {
  const token = getActiveServer()?.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function getApiBase(): string {
  return getBase()
}

async function req<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const hasBody = init?.body !== undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 15_000)
  let res: Response
  try {
    res = await fetch(`${getBase()}${path}`, {
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
        ...init?.headers,
      },
      signal: init?.signal ?? controller.signal,
      ...init,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `${init?.method ?? "GET"} ${path} → ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export interface HuxfluxSettings {
  reviewPrompt?: string
  defaultModel?: string
}

export const api = {
  // Server config / feature flags
  getServerConfig: () => req<{ githubEnabled: boolean; feedbackEnabled: boolean }>("/api/config"),

  // Settings
  getSettings: () => req<HuxfluxSettings>("/api/settings"),
  updateSettings: (body: Partial<HuxfluxSettings>) => req<HuxfluxSettings>("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),

  // Agents
  getAgents: () => req<AgentSummary[]>("/api/agents"),
  getAgent: (id: string) => req<Agent>(`/api/agents/${id}`),
  getAgentSessions: (id: string) => req<AgentSummary[]>(`/api/agents/${id}/sessions`),
  createAgent: (body: {
    repoId?: string
    title: string
    branch: string
    model?: string
    location?: string
    description?: string
    shareWorktreeWith?: string
    noWorktree?: boolean
    existingBranch?: boolean
  }) => req<Agent>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (
    id: string,
    body: Partial<Pick<Agent, "title" | "status" | "branch" | "pr" | "description" | "unread" | "baseBranch" | "draft">>
  ) => req<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAgent: (id: string) => req<void>(`/api/agents/${id}`, { method: "DELETE" }),
  generateTitle: (id: string) => req<Agent>(`/api/agents/${id}/generate-title`, { method: "POST" }),
  stopAgent: (id: string) => req<{ stopped: boolean }>(`/api/agents/${id}/stop`, { method: "POST" }),
  answerQuestion: (id: string, answers: Record<string, string>) =>
    req<{ ok: boolean }>(`/api/agents/${id}/answer`, { method: "POST", body: JSON.stringify({ answers }) }),
  switchBranch: (id: string, branch: string, force?: boolean) => req<Agent>(`/api/agents/${id}/switch-branch`, { method: "POST", body: JSON.stringify({ branch, force }) }),
  renameBranch: (id: string, branch: string) => req<Agent>(`/api/agents/${id}/rename-branch`, { method: "POST", body: JSON.stringify({ branch }) }),

  // Stats
  getStats: () => req<WorkspaceStats>("/api/stats"),
  getWrapped: (period: string, from?: string, to?: string, refresh?: boolean, length?: "short" | "medium" | "long") => {
    const params = new URLSearchParams({ period })
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    if (refresh) params.set("refresh", "true")
    if (length) params.set("length", length)
    // Claude summary generation can take 20–30s; give it headroom.
    return req<WrappedSummary>(`/api/wrapped?${params}`, { timeoutMs: 60_000 })
  },

  // Messages
  getMessages: (agentId: string) => req<Message[]>(`/api/agents/${agentId}/messages`),
  getMoreMessages: (agentId: string, before: string) =>
    req<Message[]>(`/api/agents/${agentId}/messages?before=${encodeURIComponent(before)}&limit=50`),
  sendMessage: (agentId: string, content: string, opts?: { planMode?: boolean }) =>
    req<{ status: string }>(`/api/agents/${agentId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, ...opts }),
    }),

  // Files
  getFiles: (agentId: string) => req<FileChange[]>(`/api/agents/${agentId}/files`),
  getDiff: (agentId: string, path: string) =>
    fetch(`${getBase()}/api/agents/${agentId}/files/diff?path=${encodeURIComponent(path)}`, {
      headers: authHeaders(),
    }).then((r) => r.text()),
  getFileTree: (agentId: string) =>
    req<{ name: string; path: string; type: "file" | "directory"; children?: any[] }[]>(`/api/agents/${agentId}/files/tree`),
  getFileContent: (agentId: string, path: string) =>
    fetch(`${getBase()}/api/agents/${agentId}/files/content?path=${encodeURIComponent(path)}`, { headers: authHeaders() }).then((r) => r.text()),
  getBaseFileContent: (agentId: string, path: string) =>
    fetch(`${getBase()}/api/agents/${agentId}/files/base-content?path=${encodeURIComponent(path)}`, { headers: authHeaders() }).then((r) => r.text()),
  saveFileContent: (agentId: string, path: string, content: string) =>
    req<{ ok: boolean }>(`/api/agents/${agentId}/files/content`, { method: "PUT", body: JSON.stringify({ path, content }) }),
  refreshFiles: (agentId: string) =>
    req<FileChange[]>(`/api/agents/${agentId}/files/refresh`, { method: "POST" }),
  openIn: (agentId: string, app: string) =>
    req<{ ok: boolean }>(`/api/agents/${agentId}/open-in`, { method: "POST", body: JSON.stringify({ app }) }),
  getWorktreePath: (agentId: string) =>
    req<{ path: string }>(`/api/agents/${agentId}/worktree-path`),

  // Terminal
  getTerminal: (agentId: string) => req<string[]>(`/api/agents/${agentId}/terminal`),

  // Terminal Tabs
  getTerminalTabs: (agentId: string) =>
    req<{ id: string; terminalId: string; label: string | null; orderIdx: number }[]>(
      `/api/agents/${agentId}/terminal-tabs`
    ),
  createTerminalTab: (agentId: string) =>
    req<{ id: string; terminalId: string; label: string | null; orderIdx: number }>(
      `/api/agents/${agentId}/terminal-tabs`, { method: "POST" }
    ),
  updateTerminalTab: (agentId: string, terminalId: string, body: { label: string | null }) =>
    req<{ id: string; terminalId: string; label: string | null; orderIdx: number }>(
      `/api/agents/${agentId}/terminal-tabs/${encodeURIComponent(terminalId)}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),
  deleteTerminalTab: (agentId: string, terminalId: string) =>
    req<void>(`/api/agents/${agentId}/terminal-tabs/${encodeURIComponent(terminalId)}`, { method: "DELETE" }),

  // Repos
  getRepos: () => req<Repo[]>("/api/repos"),
  createRepo: (body: Omit<Repo, "id" | "createdAt" | "workspacesPath"> & { workspacesPath?: string }) =>
    req<Repo>("/api/repos", { method: "POST", body: JSON.stringify(body) }),
  cloneRepo: (body: { url: string; location: string; name?: string }) =>
    req<Repo>("/api/repos/clone", { method: "POST", body: JSON.stringify(body) }),
  quickStartRepo: (body: { name: string; location: string; template: "empty" | "vite" | "tanstack-start" }) =>
    req<Repo>("/api/repos/quick-start", { method: "POST", body: JSON.stringify(body) }),
  updateRepo: (id: string, body: Partial<Repo>) =>
    req<Repo>(`/api/repos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRepo: (id: string) => req<void>(`/api/repos/${id}`, { method: "DELETE" }),
  getRepoBranches: (id: string) => req<string[]>(`/api/repos/${id}/branches`),

  // Filesystem
  findRepos: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return req<{ name: string; path: string }[]>(`/api/fs/repos${qs}`)
  },
  browseFs: (path?: string) => {
    const qs = path ? `?path=${encodeURIComponent(path)}` : ""
    return req<{ path: string; dirs: { name: string; path: string }[] }>(`/api/fs/browse${qs}`)
  },
  getDefaultBranch: (repoPath: string) =>
    req<{ branch: string }>(`/api/fs/default-branch?path=${encodeURIComponent(repoPath)}`),

  // GitHub / PR (repo-scoped, repoId is "owner/repo")
  listPRs: () => req<OpenPRWithRepo[]>("/api/prs"),
  getPRFiles: (repoId: string, number: number) => {
    const [owner, repo] = repoId.split("/")
    return req<PRFileDiff[]>(`/api/prs/${owner}/${repo}/${number}/files`)
  },
  getPRDetailsForRepo: (repoId: string, number: number) => {
    const [owner, repo] = repoId.split("/")
    return req<PRDetails>(`/api/prs/${owner}/${repo}/${number}/details`)
  },
  getPRFileContent: (repoId: string, number: number, filePath: string, side: "base" | "head") => {
    const [owner, repo] = repoId.split("/")
    return fetch(`${getBase()}/api/prs/${owner}/${repo}/${number}/file-content?path=${encodeURIComponent(filePath)}&side=${side}`, { headers: authHeaders() }).then((r) => r.text())
  },
  resolveThread: (threadId: string) =>
    req<{ ok: boolean }>(`/api/prs/threads/${encodeURIComponent(threadId)}/resolve`, { method: "POST" }),
  deleteComment: (repoId: string, commentId: number) => {
    const [owner, repo] = repoId.split("/")
    return req<{ ok: boolean }>(`/api/prs/${owner}/${repo}/comments/${commentId}`, { method: "DELETE" })
  },
  replyToPRComment: (repoId: string, prNumber: number, commentId: number, body: string) => {
    const [owner, repo] = repoId.split("/")
    return req<{ ok: boolean }>(`/api/prs/${owner}/${repo}/${prNumber}/comments/${commentId}/reply`, {
      method: "POST",
      body: JSON.stringify({ body }),
    })
  },
  submitPRReview: (
    repoId: string,
    prNumber: number,
    body: { event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; body: string; comments: Array<{ path: string; line: number; body: string; start_line?: number }> }
  ) => {
    const [owner, repo] = repoId.split("/")
    return req<{ ok: boolean }>(`/api/prs/${owner}/${repo}/${prNumber}/submit-review`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  sendSingleComment: (repoId: string, prNumber: number, body: string, path?: string, line?: number) => {
    const [owner, repo] = repoId.split("/")
    return req<{ ok: boolean }>(`/api/prs/${owner}/${repo}/${prNumber}/comment`, {
      method: "POST",
      body: JSON.stringify({ body, path, line }),
    })
  },
  getPRChatMessages: (repoId: string, prNumber: number) => {
    const [owner, repo] = repoId.split("/")
    return req<PRChatMessage[]>(`/api/prs/${owner}/${repo}/${prNumber}/chat-messages`)
  },
  clearPRChatMessages: (repoId: string, prNumber: number) => {
    const [owner, repo] = repoId.split("/")
    return req<{ ok: boolean }>(`/api/prs/${owner}/${repo}/${prNumber}/chat-messages`, { method: "DELETE" })
  },
  streamPRReview: (repoId: string, prNumber: number, existingComments?: Array<{ path: string; line: number; body: string }>, model?: string) => {
    const [owner, repo] = repoId.split("/")
    const payload: Record<string, unknown> = {}
    if (existingComments?.length) payload.existingComments = existingComments
    if (model) payload.model = model
    const hasBody = Object.keys(payload).length > 0
    return fetch(`${getBase()}/api/prs/${owner}/${repo}/${prNumber}/review`, {
      method: "POST",
      headers: { ...authHeaders(), ...(hasBody ? { "Content-Type": "application/json" } : {}) },
      ...(hasBody ? { body: JSON.stringify(payload) } : {}),
    })
  },
  streamPRChat: (repoId: string, prNumber: number, messages: Array<{ role: "user" | "assistant"; content: string }>, model?: string) => {
    const [owner, repo] = repoId.split("/")
    return fetch(`${getBase()}/api/prs/${owner}/${repo}/${prNumber}/chat`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ messages, ...(model ? { model } : {}) }),
    })
  },

  // GitHub / PR (agent-scoped)
  getPRDetails: (agentId: string) => req<PRDetails>(`/api/agents/${agentId}/pr/details`),
  createPR: (agentId: string, body: { title: string; body?: string; draft?: boolean }) =>
    req<PRStatus>(`/api/agents/${agentId}/pr`, { method: "POST", body: JSON.stringify(body) }),
  markPRReady: (agentId: string) =>
    req<PRStatus>(`/api/agents/${agentId}/pr/ready`, { method: "PUT" }),
  rerequestReview: (agentId: string) =>
    req<PRStatus>(`/api/agents/${agentId}/pr/rerequest-review`, { method: "POST" }),
  mergePR: (agentId: string, method?: "merge" | "squash" | "rebase") =>
    req<PRStatus>(`/api/agents/${agentId}/pr/merge`, { method: "POST", body: JSON.stringify({ method: method ?? "squash" }) }),
  mergePRByRepo: (repoId: string, prNumber: number, method?: "merge" | "squash" | "rebase") => {
    const [owner, repo] = repoId.split("/")
    return req<{ ok: boolean }>(`/api/prs/${owner}/${repo}/${prNumber}/merge`, { method: "POST", body: JSON.stringify({ method: method ?? "squash" }) })
  },
  uploadFile: (agentId: string, name: string, data: string, mimeType: string) =>
    req<{ path: string; name: string; mimeType: string }>(`/api/agents/${agentId}/upload`, {
      method: "POST",
      body: JSON.stringify({ name, data, mimeType }),
    }),

  // Feedback
  submitFeedback: (body: { title: string; body?: string }) =>
    req<{ url: string; number: number }>("/api/feedback", { method: "POST", body: JSON.stringify(body) }),

  // System
  getSystemSshInfo: () =>
    req<{ host: string; port: number; user: string; configured: boolean }>("/api/system/ssh-info"),

  // Slash commands
  getSlashCommands: (agentId?: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return agentId
      ? req<SlashCommand[]>(`/api/agents/${agentId}/slash-commands${qs}`)
      : req<SlashCommand[]>(`/api/slash-commands${qs}`)
  },
}
