// Local user preferences for the diff viewer.
// Persisted in localStorage. Read/write through these accessors only.

const DIFF_VIEW_MODE_KEY = "huxflux:diff:view-mode"
const DIFF_FILE_LIST_KEY = "huxflux:diff:file-list"

export type DiffViewMode = "tree" | "stacked"

export function getDiffViewMode(): DiffViewMode {
  return (localStorage.getItem(DIFF_VIEW_MODE_KEY) as DiffViewMode) || "tree"
}

export function setDiffViewMode(mode: DiffViewMode) {
  localStorage.setItem(DIFF_VIEW_MODE_KEY, mode)
}

export function getDiffFileList(): boolean {
  return localStorage.getItem(DIFF_FILE_LIST_KEY) !== "false"
}

export function setDiffFileList(show: boolean) {
  localStorage.setItem(DIFF_FILE_LIST_KEY, String(show))
}
