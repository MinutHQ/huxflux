import type { ReviewComment } from "@huxflux/shared"

/**
 * A review comment that has been authored locally but not yet submitted to
 * GitHub as part of a PR review. Persisted to localStorage per PR.
 */
export interface PendingReviewComment {
  id: string
  path: string
  line: number
  startLine?: number
  body: string
  source: "agentic" | "inline"
  codeContext?: ReviewComment["codeContext"]
  filePath?: string
}

/** Node in the right-pane PR file tree (Changes tab). */
export interface PRTreeEntry {
  name: string
  path: string
  type: "file" | "directory"
  children?: PRTreeEntry[]
  additions?: number
  deletions?: number
  viewed?: boolean
}

/** Merge method exposed by the GitHub repo's branch protection rules. */
export type MergeMethod = "merge" | "squash" | "rebase"

/** Slot annotation metadata for the inline-comment diff renderer. */
export type DiffAnnotationKind = "thread" | "pending" | "form"

export interface DiffSlotMetadata {
  id: string
  kind: DiffAnnotationKind
}

/** PR detail subset shown in the standalone review page header. */
export interface PRDetailsHeader {
  title: string
  body?: string
  author: string
  avatarUrl?: string
  createdAt: string
  url: string
  headSha?: string
}
