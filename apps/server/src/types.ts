// Mirrors apps/web/src/data/mock.ts — shared contract between server and web client

export type AgentStatus = "done" | "in-review" | "in-progress" | "backlog" | "cancelled"

export interface FileChange {
  path: string
  additions: number
  deletions: number
}

export interface ToolCall {
  id: string
  tool: string
  args?: string
  result?: string
  duration?: string
  subCalls?: ToolCall[]
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  thinking?: string
  timestamp: string
  toolCalls?: ToolCall[]
}

export interface Agent {
  id: string
  repoId?: string
  title: string
  status: AgentStatus
  branch: string
  pr?: string
  model: string
  location: string
  unread?: number
  daysAgo?: string
  description?: string
  diffSummary?: { additions: number; deletions: number; commits?: number }
  messages: Message[]
  fileChanges: FileChange[]
  terminalOutput: string[]
  createdAt: string
  updatedAt: string
}

export interface AgentSummary extends Omit<Agent, "messages" | "fileChanges" | "terminalOutput"> {}

export interface Repo {
  id: string
  name: string
  path: string
  workspacesPath: string
  branchFrom: string
  remote: string
  previewUrl?: string
  setupScript?: string
  runScript?: string
  archiveScript?: string
  createdAt: string
}
