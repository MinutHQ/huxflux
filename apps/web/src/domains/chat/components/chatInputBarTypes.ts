import type React from "react"
import type { Agent, AgentSummary, PRComment, FileChange, SlashCommand } from "@huxflux/shared"
import type { MentionAttachment, MentionOption } from "../hooks/useMentionsAndSlash"

export interface Attachment { name: string; path: string; mimeType: string }

export interface Capabilities {
  effortLevels?: string[]
  planMode?: boolean
}

export interface ChatInputBarProps {
  agent: Agent
  allAgents: AgentSummary[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allModels: any[]
  capabilities: Capabilities
  pendingComments: PRComment[]
  attachments: Attachment[]
  linkedAgents: AgentSummary[]
  mentionAttachments: MentionAttachment[]
  mentionQuery: string | null
  mentionOptions: MentionOption[]
  mentionIndex: number
  setMentionIndex: (updater: (i: number) => number) => void
  setMentionQuery: (q: string | null) => void
  applyMention: (opt: MentionOption) => void
  mentionListRef: React.Ref<HTMLDivElement>
  mentionActiveRef: React.Ref<HTMLDivElement>
  slashQuery: string | null
  setSlashQuery: (q: string | null) => void
  filteredCommands: SlashCommand[]
  slashIndex: number
  setSlashIndex: (updater: (i: number) => number) => void
  applySlashCommand: (name: string) => void
  input: string
  onInputChange: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  isInPlanMode: boolean
  planMode: boolean
  setPlanMode: (updater: (v: boolean) => boolean) => void
  showPlanApproval: boolean
  planContent: string | null
  effort: "" | "low" | "medium" | "high" | "max"
  setEffort: (v: "" | "low" | "medium" | "high" | "max") => void
  isStreaming: boolean
  canSend: boolean
  hideChrome: boolean
  fileChanges: FileChange[]
  onRemoveComment?: (id: string) => void
  onOpenDiffFile?: (file: FileChange) => void
  onRemoveAttachment: (path: string) => void
  onRemoveLinkedAgent: (id: string) => void
  onRemoveMention: (m: MentionAttachment) => void
  onToggleLinkedAgent: (a: AgentSummary) => void
  onModelChange: (value: string) => void
  onSend: () => void
  onPlanApprove: () => void
  onPlanDismiss: () => void
  onUploadFiles: (files: File[]) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}
