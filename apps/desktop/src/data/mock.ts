// Re-export everything from @hive/shared so existing component imports keep working.
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
} from "@hive/shared"

export { statusConfig, statusOrder } from "@hive/shared"
