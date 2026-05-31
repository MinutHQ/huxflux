import type { FileChange } from "@huxflux/shared"

export interface ChatTab {
  agentId: string
  title: string
  isChild?: boolean
}

export type OpenFile =
  | { type: "diff"; file: FileChange }
  | { type: "content"; path: string }
  | { type: "changes"; scrollToPath?: string }
  | { type: "diff-browser" }
  | { type: "pr" }

export interface FileTab {
  id: string
  file: OpenFile
}

export interface PendingAgent {
  title: string
  branch: string
  repoName: string
  estimatedMs: number
}

export interface DeletingAgent {
  title: string
  branch: string
  repoName: string
}

export function fileTabPath(f: OpenFile): string | null {
  if (f.type === "diff") return f.file.path
  if (f.type === "content") return f.path
  return null
}

export function fileTabKey(f: OpenFile): string {
  return fileTabPath(f) ?? f.type
}
