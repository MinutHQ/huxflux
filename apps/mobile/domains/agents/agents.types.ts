// Domain-internal types for the mobile agents domain.

import type { ToolCall } from "@huxflux/shared"

export interface TeamAgent {
  id: string
  description: string
  status: "running" | "done"
  subCalls?: ToolCall[]
  outputText?: string
  result?: string
}

export interface Attachment {
  name: string
  path: string
  mimeType: string
  localUri: string
}

export type ChatTab = "chat" | "files" | "pr" | "terminal"

export type GroupBy = "status" | "repo"
