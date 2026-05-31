import type { Agent, AgentSummary, PRComment, FileChange, ToolCall } from "@huxflux/shared"
import type { OpenFile, ChatTab } from "@/app-shell/workspace"

export interface TurnFileEdit {
  path: string
  edits: Array<{ oldStr: string; newStr: string }>
  isNew: boolean
}

export interface TeamAgent {
  id: string
  description: string
  prompt?: string
  name?: string
  status: "running" | "done"
  subCalls?: ToolCall[]
  outputText?: string
  result?: string
}

export interface TodoItem {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed"
  priority?: "low" | "medium" | "high"
}

export interface SetupStep {
  label: string
  icon: string
}

export interface PendingAgentInfo {
  title: string
  branch: string
  repoName: string
  estimatedMs: number
}

export interface DeletingAgentInfo {
  title: string
  branch: string
  repoName: string
}

export type PendingQuestionOption = { label: string; description?: string }
export type PendingQuestionEntry = {
  question: string
  header?: string
  multiSelect?: boolean
  options?: PendingQuestionOption[]
}
export interface PendingQuestion {
  toolUseId: string
  agentId?: string
  questions: PendingQuestionEntry[]
}

export interface ChatViewProps {
  agent: Agent
  isStreaming: boolean
  loadMore?: () => Promise<void>
  hasMore?: boolean
  isLoadingMore?: boolean
  openFileTab: OpenFile | null
  onClearFileTab: () => void
  tabs?: ChatTab[]
  activeTabId?: string | null
  onTabSelect?: (agentId: string) => void
  onTabClose?: (agentId: string) => void
  onNewTab?: () => void
  onTabTitleChange?: (agentId: string, title: string) => void
  pendingComments?: PRComment[]
  onAddComment?: (c: PRComment) => void
  onOpenDiffFile?: (file: FileChange) => void
  onRemoveComment?: (id: string) => void
  onClearComments?: () => void
  githubEnabled?: boolean
  pendingQuestion?: PendingQuestion | null
  onClearPendingQuestion?: () => void
  /** Hide the header bar and tab bar — used for embedded views like task refinement */
  hideChrome?: boolean
  /** Hide only the top metadata bar (branches, open-in) — used when header is rendered externally */
  hideHeader?: boolean
  /** Create a new tab and send an initial message to it */
  onNewTabWithMessage?: (message: string) => void
  /** Message queued during agent setup — sent automatically on mount */
  initialMessage?: string | null
  /** Called after the initial message is consumed */
  onConsumeInitialMessage?: () => void
}

export type { Agent, AgentSummary, FileChange, PRComment, ToolCall }
