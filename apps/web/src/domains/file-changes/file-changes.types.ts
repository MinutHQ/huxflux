import type { Agent, FileChange, PRComment } from "@huxflux/shared"

/** A node in the unified file tree (either a directory or a file). */
export interface FileTreeEntry {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileTreeEntry[]
}

/** Props for the top-level `FileChangesView`. */
export interface FileChangesViewProps {
  agent: Agent
  selectedFile: string | null
  onFileSelect: (file: FileChange | null) => void
  onFileContentSelect: (path: string) => void
  onAddComment: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
  onOpenDiffBrowser?: (scrollToPath?: string) => void
  onOpenPRTab?: () => void
  /** When provided, tab state is controlled externally */
  tab?: "files" | "changes" | "pr"
  onTabChange?: (tab: "files" | "changes" | "pr") => void
  /** Hide the internal tab header (when tabs are rendered elsewhere) */
  hideHeader?: boolean
}

/** Annotation metadata for inline comment forms and persisted comments. */
export type CommentAnnotation =
  | { type: "comment-form"; lineNumber: number }
  | { type: "comment"; comment: PRComment }

/** Preloaded diff payload (provided when the parent batch-fetched diffs). */
export interface PreloadedDiff {
  diff: string
  newContent: string
  oldContent: string
}

/** Merge methods supported by the PR merge dropdown. */
export type MergeMethod = "merge" | "squash" | "rebase"
