export type AgentStatus = "done" | "in-review" | "in-progress" | "backlog" | "cancelled"

export interface PRStatus {
  number: number
  url: string
  state: "open" | "closed"
  merged: boolean
  draft: boolean
  mergeableState: string // "clean" | "blocked" | "dirty" | "unknown" | "unstable"
  hasChangeRequests: boolean
  hasDismissedReviews?: boolean
}

export interface PRReview {
  author: string
  avatarUrl?: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING"
  submittedAt?: string
}

export interface PRCheck {
  name: string
  status: "queued" | "in_progress" | "completed"
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | "neutral" | null
  url?: string
}

export interface PRComment {
  id: string
  databaseId?: number
  author: string
  avatarUrl?: string
  body: string
  createdAt: string
  url: string
  isReply: boolean
  path?: string
  line?: number
  code?: string
}

export interface PRThread {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path?: string
  line?: number
  comments: PRComment[]
}

export interface PRIssueComment {
  id: number
  author: string
  avatarUrl?: string
  body: string
  createdAt: string
  url: string
}

export interface PRDetails extends PRStatus {
  title: string
  body?: string
  author: string
  avatarUrl?: string
  createdAt: string
  branch: string
  baseBranch: string
  headSha: string
  reviews: PRReview[]
  checks: PRCheck[]
  threads: PRThread[]
  issueComments: PRIssueComment[]
  currentUser?: string
  reviewingStartedAt?: number | null
  reviewingCurrentStep?: number | null
}

export interface OpenPR {
  number: number
  title: string
  author: string
  authorAvatar?: string
  branch: string
  baseBranch: string
  body?: string
  additions?: number
  deletions?: number
  createdAt: string
  hasChangeRequests: boolean
  draft: boolean
  url: string
  reviewRequested?: boolean
  userReviewed?: boolean
  isReadyToMerge?: boolean
}

export interface OpenPRWithRepo extends OpenPR {
  repoId: string
  repoName: string
  agentId?: string
}

export interface PRChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  isReview: boolean
  reviewHeadSha?: string
  commitSha?: string | null
  createdAt: string
}

export interface PRFileDiff {
  path: string
  additions: number
  deletions: number
  status: "added" | "modified" | "deleted" | "renamed"
  patch?: string
}

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
  outputText?: string  // text output streamed by a sub-agent
  // Text the main assistant emitted just before this tool call
  // (e.g. "Now let me look at..."). Lets the UI interleave intermediate
  // narration with the tool calls in the order they were produced.
  precedingText?: string
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  thinking?: string
  timestamp: string
  toolCalls?: ToolCall[]
  durationMs?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  // Display name for the sender (for delegated messages between agents)
  sender?: string
  // Client-only: text being streamed since the last tool call. Rendered
  // inside the tool-calls accordion so intermediate narration doesn't first
  // appear under the bubble and then jump into the accordion. Cleared on
  // message:done (server then provides the authoritative `content`).
  pendingText?: string
}

export interface Agent {
  id: string
  repoId?: string
  title: string
  status: AgentStatus
  branch: string
  baseBranch?: string
  parentAgentId?: string
  pr?: string
  prNumber?: number
  prStatus?: PRStatus
  model: string
  provider?: string
  taskId?: string | null  // set for refine agents — hidden from sidebar
  threadParentId?: string | null  // set for thread agents spawned by another agent
  location: string
  unread?: number
  streaming?: boolean
  daysAgo?: string
  description?: string
  draft?: string
  diffSummary?: { additions: number; deletions: number; commits?: number }
  prCommentMonitoring?: number | null  // null = global default, 0 = off, 1 = on
  ciMonitoring?: number | null         // null = global default, 0 = off, 1 = on
  pinned?: boolean                     // pinned to the Pinned sidebar section, never auto-moved by status
  messages: Message[]
  hasMore?: boolean
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
  branchPrefix?: string
  remote: string
  previewUrl?: string
  setupScript?: string
  runScript?: string
  archiveScript?: string
  preferences?: string  // JSON blob: Record<string, string>
  icon?: string
  type?: "git" | "folder"
  createdAt: string
}

export interface SlashCommand {
  name: string
  description: string
  args?: string
  source: "builtin" | "skill"
}

import { statusColors } from "@huxflux/tokens"

function sc(key: keyof typeof statusColors, label: string) {
  const t = statusColors[key]
  return { label, color: t.tw.color, dotColor: t.tw.dot, hex: t.color }
}

export const statusConfig: Record<AgentStatus, { label: string; color: string; dotColor: string; hex: string }> = {
  done:          sc("done",         "Done"),
  "in-review":   sc("in-review",    "In review"),
  "in-progress": sc("in-progress",  "In progress"),
  backlog:       sc("backlog",      "Backlog"),
  cancelled:     sc("cancelled",    "Canceled"),
}

export const statusOrder: AgentStatus[] = ["in-progress", "in-review", "backlog", "done", "cancelled"]

// ── Tasks ────────────────────────────────────────────────────────────────────

export type TaskStatus = "backlog" | "refining" | "ready" | "in-progress" | "in-review" | "done"

export interface TaskComment {
  id: string
  author: string
  role: "ai" | "user"
  content: string
  agentId?: string | null
  createdAt: string
}

export interface TaskAgent {
  agentId: string
  agentTitle: string
  agentStatus: AgentStatus
  agentBranch: string
  prNumber?: number | null
  prUrl?: string | null
  prMerged?: boolean
  prDraft?: boolean
  ciStatus?: "passing" | "failing" | "pending" | null
}

export interface TaskItem {
  id: string
  parentId: string | null
  jiraKey: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: string | null
  assignee: string | null
  projectKey: string | null
  repoId?: string | null
  repoName?: string | null
  refineAgentId?: string | null
  agents: TaskAgent[]
  comments: TaskComment[]
  subtasks: TaskItem[]
  dependencies?: string[]  // IDs of sibling tasks this depends on
  sprintName?: string | null
  sprintState?: string | null
  createdAt: string
  updatedAt: string
}

// ── Automations ──────────────────────────────────────────────────────────────

export type AutomationStatus = "draft" | "active" | "paused" | "error"

export interface AutomationStep {
  id: string
  type: "trigger" | "fetch" | "parse" | "compare" | "transform" | "notify" | "browser" | "custom"
  label: string
  config: Record<string, unknown>
  position: { x: number; y: number }
  connections: string[] // IDs of next steps
}

export interface AutomationRun {
  id: string
  automationId: string
  status: "running" | "success" | "failure"
  output: string | null
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface AutomationSkill {
  id: string
  name: string
  description: string | null
  scriptPath: string
  createdAt: string
}

export interface Automation {
  id: string
  name: string
  description: string | null
  status: AutomationStatus
  schedule: string | null
  steps: AutomationStep[]
  builderAgentId: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  runCount: number
  runs: AutomationRun[]
  createdAt: string
  updatedAt: string
}
