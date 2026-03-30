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
  createdAt?: string
  updatedAt?: string
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

export const statusConfig: Record<AgentStatus, { label: string; color: string; dotColor: string }> = {
  done: { label: "Done", color: "text-emerald-500", dotColor: "bg-emerald-500" },
  "in-review": { label: "In review", color: "text-blue-400", dotColor: "bg-blue-400" },
  "in-progress": { label: "In progress", color: "text-amber-400", dotColor: "bg-amber-400" },
  backlog: { label: "Backlog", color: "text-zinc-400", dotColor: "bg-zinc-500" },
  cancelled: { label: "Canceled", color: "text-red-400", dotColor: "bg-red-400" },
}

export const statusOrder: AgentStatus[] = ["in-progress", "in-review", "backlog", "done", "cancelled"]

export interface SlashCommand {
  name: string
  description: string
  args?: string
  source: "builtin" | "skill"
}
