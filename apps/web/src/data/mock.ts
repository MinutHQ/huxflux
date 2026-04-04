// Re-export everything from @huxflux/shared so existing component imports keep working.
export type {
  AgentStatus,
  PRStatus,
  PRReview,
  PRCheck,
  PRComment,
  PRThread,
  PRIssueComment,
  PRDetails,
  FileChange,
  ToolCall,
  Message,
  Agent,
  AgentSummary,
  Repo,
  SlashCommand,
} from "@huxflux/shared"

export { statusConfig, statusOrder } from "@huxflux/shared"
