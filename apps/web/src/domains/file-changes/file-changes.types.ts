import type { PRComment } from "@huxflux/shared"

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

/** A tab in the Files section. Preview tabs are replaced by the next single-click open. */
export interface OpenFileTab {
  path: string
  preview: boolean
}

/** Unsaved editor state for one open file, kept while switching tabs. */
export interface FileBuffer {
  /** Current editor text. */
  draft: string
  /** Text as last loaded from or saved to disk. Dirty when `draft !== baseline`. */
  baseline: string
  scrollTop: number
}

/** Ask the Files section to open a file, optionally at a line. Bump `nonce` to repeat. */
export interface OpenFileRequest {
  path: string
  line?: number
  nonce: number
}
