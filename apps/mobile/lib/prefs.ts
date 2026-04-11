import { getStorage } from "@huxflux/shared"

const STRIP_KEY = "huxflux:strip:youre-right"
const ALWAYS_CONTEXT_KEY = "huxflux:always:context"
const AUTO_CONVERT_KEY = "huxflux:auto:convert"
const GIT_AUTO_PUSH_KEY = "huxflux:git:auto-push"
const GIT_DELETE_BRANCH_KEY = "huxflux:git:delete-branch-on-archive"
const GIT_ARCHIVE_ON_MERGE_KEY = "huxflux:git:archive-on-merge"
export const COLLAPSED_SECTIONS_KEY = "huxflux:mobile:collapsed-sections"
export const REPO_FILTER_KEY = "huxflux:mobile:repo-filter"
export const GROUP_BY_KEY = "huxflux:mobile:group-by"
export const HIDE_REVIEWED_PRS_KEY = "huxflux:mobile:hide-reviewed-prs"
export const BULK_REVIEW_CONCURRENCY_KEY = "huxflux:bulk-review-concurrency"

export const PREF_KEYS = [
  STRIP_KEY,
  ALWAYS_CONTEXT_KEY,
  AUTO_CONVERT_KEY,
  GIT_AUTO_PUSH_KEY,
  GIT_DELETE_BRANCH_KEY,
  GIT_ARCHIVE_ON_MERGE_KEY,
  COLLAPSED_SECTIONS_KEY,
  REPO_FILTER_KEY,
  GROUP_BY_KEY,
  HIDE_REVIEWED_PRS_KEY,
  BULK_REVIEW_CONCURRENCY_KEY,
]

function get(key: string, defaultVal: boolean): boolean {
  const v = getStorage().getItem(key)
  if (v === null) return defaultVal
  return v === "true"
}

function set(key: string, value: boolean) {
  getStorage().setItem(key, String(value))
}

export const prefs = {
  getStripYoureRight: () => get(STRIP_KEY, false),
  setStripYoureRight: (v: boolean) => set(STRIP_KEY, v),

  getAlwaysContext: () => get(ALWAYS_CONTEXT_KEY, false),
  setAlwaysContext: (v: boolean) => set(ALWAYS_CONTEXT_KEY, v),

  getAutoConvert: () => get(AUTO_CONVERT_KEY, true),
  setAutoConvert: (v: boolean) => set(AUTO_CONVERT_KEY, v),

  getGitAutoPush: () => get(GIT_AUTO_PUSH_KEY, false),
  setGitAutoPush: (v: boolean) => set(GIT_AUTO_PUSH_KEY, v),

  getGitDeleteBranch: () => get(GIT_DELETE_BRANCH_KEY, false),
  setGitDeleteBranch: (v: boolean) => set(GIT_DELETE_BRANCH_KEY, v),

  getGitArchiveOnMerge: () => get(GIT_ARCHIVE_ON_MERGE_KEY, true),
  setGitArchiveOnMerge: (v: boolean) => set(GIT_ARCHIVE_ON_MERGE_KEY, v),
}
