import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  workspacesPath: text("workspaces_path").notNull(),
  branchFrom: text("branch_from").notNull().default("origin/main"),
  branchPrefix: text("branch_prefix"),
  remote: text("remote").notNull().default("origin"),
  previewUrl: text("preview_url"),
  setupScript: text("setup_script"),
  runScript: text("run_script"),
  archiveScript: text("archive_script"),
  preferences: text("preferences"), // JSON blob: Record<string, string>
  icon: text("icon"),
  createdAt: text("created_at").notNull(),
})

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  repoId: text("repo_id").references(() => repos.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("backlog"),
  branch: text("branch").notNull(),
  pr: text("pr"),
  model: text("model").notNull().default("Sonnet 4.6"),
  location: text("location").notNull(),
  unread: integer("unread").default(0),
  streaming: integer("streaming").default(0),
  description: text("description"),
  prNumber: integer("pr_number"),
  prStatus: text("pr_status"), // JSON: PRStatus
  baseBranch: text("base_branch"), // optional per-agent override of repo.branchFrom
  parentAgentId: text("parent_agent_id"), // if set, this is a child tab — hidden from sidebar
  sessionId: text("session_id"), // Claude Code session ID — used for --resume on follow-up messages
  noWorktree: integer("no_worktree"), // 1 = run directly in repo.path, no git worktree
  deletedAt: text("deleted_at"), // soft delete — set instead of hard DELETE
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull().default(""),
  thinking: text("thinking"),
  timestamp: text("timestamp").notNull(),
  createdAt: text("created_at").notNull(),
  durationMs: integer("duration_ms"),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cacheReadTokens: integer("cache_read_tokens"),
  cacheWriteTokens: integer("cache_write_tokens"),
})

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  parentId: text("parent_id"), // for sub-calls (Agent tool)
  tool: text("tool").notNull(),
  args: text("args"),
  result: text("result"),
  duration: text("duration"),
  orderIdx: integer("order_idx").notNull().default(0),
})

export const fileChanges = sqliteTable("file_changes", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
})

export const terminalLines = sqliteTable("terminal_lines", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  line: text("line").notNull(),
  createdAt: text("created_at").notNull(),
})

export const terminalTabs = sqliteTable("terminal_tabs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  terminalId: text("terminal_id").notNull(), // PTY key suffix e.g. "t1" or short UUID
  label: text("label"),                      // null = use default "Terminal N" display label
  orderIdx: integer("order_idx").notNull().default(0),
})
