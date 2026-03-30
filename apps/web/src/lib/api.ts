import type { Agent, AgentSummary, FileChange, Message, Repo, SlashCommand } from "@/data/mock"
import { getServers, getActiveServerId } from "@/lib/serverStore"

function getBase(): string {
  const servers = getServers()
  const activeId = getActiveServerId()
  const active = servers.find((s) => s.id === activeId) ?? servers[0]
  return active?.url ?? import.meta.env.VITE_API_URL ?? "http://localhost:3001"
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Agents
  getAgents: () => req<AgentSummary[]>("/api/agents"),
  getAgent: (id: string) => req<Agent>(`/api/agents/${id}`),
  createAgent: (body: { repoId?: string; title: string; branch: string; model?: string; location?: string; description?: string }) =>
    req<Agent>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (id: string, body: Partial<Pick<Agent, "title" | "status" | "pr" | "description" | "unread">>) =>
    req<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAgent: (id: string) =>
    req<void>(`/api/agents/${id}`, { method: "DELETE" }),

  // Messages
  getMessages: (agentId: string) => req<Message[]>(`/api/agents/${agentId}/messages`),
  sendMessage: (agentId: string, content: string) =>
    req<{ status: string }>(`/api/agents/${agentId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  // Files
  getFiles: (agentId: string) => req<FileChange[]>(`/api/agents/${agentId}/files`),
  getDiff: (agentId: string, path: string) =>
    fetch(`${getBase()}/api/agents/${agentId}/files/diff?path=${encodeURIComponent(path)}`).then((r) => r.text()),
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
  deleteRepo: (id: string) =>
    req<void>(`/api/repos/${id}`, { method: "DELETE" }),

  // Filesystem
  findRepos: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return req<{ name: string; path: string }[]>(`/api/fs/repos${qs}`)
  },

  // Slash commands
  getSlashCommands: (agentId?: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return agentId
      ? req<SlashCommand[]>(`/api/agents/${agentId}/slash-commands${qs}`)
      : req<SlashCommand[]>(`/api/slash-commands${qs}`)
  },
}
