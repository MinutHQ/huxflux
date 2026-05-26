// Mirrors apps/web/src/data/mock.ts — shared contract between server and web client

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
}

export interface PRThread {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path?: string
  line?: number
  comments: PRComment[]
}

// General PR discussion comments (not inline review threads)
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
}

export interface OpenPRWithRepo extends OpenPR {
  repoId: string
  repoName: string
  agentId?: string
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
  // Text the assistant emitted just before this tool call (intermediate
  // narration like "Now let me look at..."). Preserved on the tool call so
  // it can be rendered inline with tool calls in the order they happened.
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
  sender?: string
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
  location: string
  unread?: number
  streaming?: boolean
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
  branchPrefix?: string
  remote: string
  previewUrl?: string
  setupScript?: string
  runScript?: string
  archiveScript?: string
  preferences?: string
  icon?: string
  type?: "git" | "folder"
  createdAt: string
}
