import type { MergeMethod } from "./pull-requests.types"

/** Human-readable labels for merge method buttons. */
export const MERGE_LABELS: Record<MergeMethod, string> = {
  squash: "Squash and merge",
  merge: "Merge commit",
  rebase: "Rebase and merge",
}

/** localStorage key prefixes used by the PR review page. */
export const STORAGE_KEYS = {
  diffStyle: "huxflux:pr-diff-style",
  pendingPrefix: "huxflux:pr-pending",
  viewedPrefix: "huxflux:pr-viewed",
} as const
