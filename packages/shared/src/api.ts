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
} from "./types"

function getBase(): string {
  return getActiveServer()?.url ?? "http://localhost:3001"
}

function authHeaders(): Record<string, string> {
  const token = getActiveServer()?.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function getApiBase(): string {
  return getBase()
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined
  const res = await fetch(`${getBase()}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...init?.headers,
    },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `${init?.method ?? "GET"} ${path} → ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Server config / feature flags
  getServerConfig: () => req<{ githubEnabled: boolean; feedbackEnabled: boolean }>("/api/config"),

  // Agents
  getAgents: () => req<AgentSummary[]>("/api/agents"),
  getAgent: (id: string) => req<Agent>(`/api/agents/${id}`),
  createAgent: (body: {
    repoId?: string
    title: string
    branch: string
    model?: string
    location?: string
    description?: string
    shareWorktreeWith?: string
    noWorktree?: boolean
  }) => req<Agent>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (
    id: string,
    body: Partial<Pick<Agent, "title" | "status" | "branch" | "pr" | "description" | "unread" | "baseBranch">>
  ) => req<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAgent: (id: string) => req<void>(`/api/agents/${id}`, { method: "DELETE" }),
  stopAgent: (id: string) => req<{ stopped: boolean }>(`/api/agents/${id}/stop`, { method: "POST" }),

  // Messages
  getMessages: (agentId: string) => req<Message[]>(`/api/agents/${agentId}/messages`),
  getMoreMessages: (agentId: string, before: string) =>
    req<Message[]>(`/api/agents/${agentId}/messages?before=${encodeURIComponent(before)}&limit=50`),
  sendMessage: (agentId: string, content: string) =>
    req<{ status: string }>(`/api/agents/${agentId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
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
  saveFileContent: (agentId: string, path: string, content: string) =>
    req<{ ok: boolean }>(`/api/agents/${agentId}/files/content`, { method: "PUT", body: JSON.stringify({ path, content }) }),
  refreshFiles: (agentId: string) =>
    req<FileChange[]>(`/api/agents/${agentId}/files/refresh`, { method: "POST" }),

  // Terminal
  getTerminal: (agentId: string) => req<string[]>(`/api/agents/${agentId}/terminal`),

  // Repos
  getRepos: () => req<Repo[]>("/api/repos"),
  createRepo: (body: Omit<Repo, "id" | "createdAt">) =>
    req<Repo>("/api/repos", { method: "POST", body: JSON.stringify(body) }),
  updateRepo: (id: string, body: Partial<Repo>) =>
    req<Repo>(`/api/repos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRepo: (id: string) => req<void>(`/api/repos/${id}`, { method: "DELETE" }),
  getRepoBranches: (id: string) => req<string[]>(`/api/repos/${id}/branches`),

  // Filesystem
  findRepos: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return req<{ name: string; path: string }[]>(`/api/fs/repos${qs}`)
  },
  getDefaultBranch: (repoPath: string) =>
    req<{ branch: string }>(`/api/fs/default-branch?path=${encodeURIComponent(repoPath)}`),

  // GitHub / PR
  getPRDetails: (agentId: string) => req<PRDetails>(`/api/agents/${agentId}/pr/details`),
  createPR: (agentId: string, body: { title: string; body?: string; draft?: boolean }) =>
    req<PRStatus>(`/api/agents/${agentId}/pr`, { method: "POST", body: JSON.stringify(body) }),
  markPRReady: (agentId: string) =>
    req<PRStatus>(`/api/agents/${agentId}/pr/ready`, { method: "PUT" }),
  rerequestReview: (agentId: string) =>
    req<PRStatus>(`/api/agents/${agentId}/pr/rerequest-review`, { method: "POST" }),
  uploadFile: (agentId: string, name: string, data: string, mimeType: string) =>
    req<{ path: string; name: string; mimeType: string }>(`/api/agents/${agentId}/upload`, {
      method: "POST",
      body: JSON.stringify({ name, data, mimeType }),
    }),

  // Feedback
  submitFeedback: (body: { title: string; body?: string }) =>
    req<{ url: string; number: number }>("/api/feedback", { method: "POST", body: JSON.stringify(body) }),

  // Slash commands
  getSlashCommands: (agentId?: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return agentId
      ? req<SlashCommand[]>(`/api/agents/${agentId}/slash-commands${qs}`)
      : req<SlashCommand[]>(`/api/slash-commands${qs}`)
  },
}
