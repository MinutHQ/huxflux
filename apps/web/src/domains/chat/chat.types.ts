import type { Agent, AgentSummary, PRComment, FileChange, ToolCall } from "@huxflux/shared"
import type { ChatTab } from "@/app-shell/workspace"

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
  /** Latest progress line reported while the sub-agent runs. */
  progress?: string
  result?: string
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

export type PendingQuestionOption = { label: string; description?: string; preview?: string }
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
  tabs?: ChatTab[]
  activeTabId?: string | null
  onTabSelect?: (agentId: string) => void
  onTabClose?: (agentId: string) => void
  onNewTab?: () => void
  onTabTitleChange?: (agentId: string, title: string) => void
  pendingComments?: PRComment[]
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
  /** Text the user typed on the setup screen but never submitted — pre-fills the input on mount */
  initialDraft?: string | null
  /** Called after the initial draft is consumed */
  onConsumeInitialDraft?: () => void
  /** The setup screen's input had focus when it was replaced — focus the composer on mount */
  initialFocus?: boolean
  /** Called after the initial focus is consumed */
  onConsumeInitialFocus?: () => void
}

export type WorkStepKind = "run" | "read" | "write" | "edit" | "search" | "fetch" | "delegate" | "task" | "other"

export interface WorkStepLabel {
  kind: WorkStepKind
  /** "Running", "Reading", ...; absent for tools without a natural verb. */
  verb?: string
  text: string
  /** A raw command keeps its code face; a description reads as prose. */
  code: boolean
}

export interface WorkStep {
  call: ToolCall
  /** When the step first showed up here; null for steps that were already there on mount. */
  at: number | null
}

export interface FinishedStep {
  step: WorkStep
  /** Milliseconds, or null when the client did not see both ends of the step. */
  took: number | null
}

export type { Agent, AgentSummary, FileChange, PRComment, ToolCall }
