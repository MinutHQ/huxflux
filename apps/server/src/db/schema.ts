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
  poolSize: integer("pool_size").default(0),
  type: text("type").notNull().default("git"), // "git" | "folder"
  createdAt: text("created_at").notNull(),
})

export const agentPorts = sqliteTable("agent_ports", {
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  port: integer("port").notNull(),
})

export const worktreePool = sqliteTable("worktree_pool", {
  id: text("id").primaryKey(),
  repoId: text("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
  location: text("location").notNull(),
  branch: text("branch").notNull(),
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
  draft: text("draft"), // persisted chat input draft
  provider: text("provider").notNull().default("claude"), // CLI provider: "claude" | "codex" | "opencode"
  taskId: text("task_id"), // if set, this is a task agent (refine/work) — hidden from sidebar, output goes to task comments
  threadParentId: text("thread_parent_id"), // if set, this agent was spawned by another agent for cross-repo work
  prCommentMonitoring: integer("pr_comment_monitoring"), // null = use global setting, 0 = off, 1 = on
  ciMonitoring: integer("ci_monitoring"), // null = use global setting, 0 = off, 1 = on
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
  sender: text("sender"), // display name for delegated messages, e.g. agent title
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
  // Text the assistant emitted between the previous tool call (or message
  // start) and this one — preserves text↔tool ordering for inline display.
  precedingText: text("preceding_text"),
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

export const prChatMessages = sqliteTable("pr_chat_messages", {
  id: text("id").primaryKey(),
  repoId: text("repo_id").notNull(),       // "owner/repo"
  prNumber: integer("pr_number").notNull(),
  role: text("role").notNull(),            // "user" | "assistant"
  content: text("content").notNull().default(""),
  isReview: integer("is_review").default(0), // 1 = agentic review result
  reviewHeadSha: text("review_head_sha"), // PR head SHA at time of review
  createdAt: text("created_at").notNull(),
})

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),  // null = top-level task, set = subtask of another task
  jiraKey: text("jira_key"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("backlog"), // backlog | refining | ready | in-progress | in-review | done
  priority: text("priority"),  // highest | high | medium | low | lowest
  assignee: text("assignee"),
  projectKey: text("project_key"),
  repoId: text("repo_id").references(() => repos.id),
  sprintName: text("sprint_name"),
  sprintState: text("sprint_state"),  // active | closed | future
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const taskAgents = sqliteTable("task_agents", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
})

export const taskComments = sqliteTable("task_comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  agentId: text("agent_id"),  // which agent posted this comment (null for user comments)
  author: text("author").notNull(),
  role: text("role").notNull(),  // "ai" | "user"
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
})

export const taskDependencies = sqliteTable("task_dependencies", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  dependsOnTaskId: text("depends_on_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
})

// ── Automations ──────────────────────────────────────────────────────────────

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft | active | paused | error
  schedule: text("schedule"), // cron expression or interval like "every 1h"
  /** JSON: array of step nodes [{id, type, label, config, position, connections}] */
  stepsJson: text("steps_json"),
  /** Path to the generated Node.js script on disk */
  scriptPath: text("script_path"),
  /** JSON: state persisted between runs (for diffing, tracking, etc.) */
  stateJson: text("state_json"),
  /** Agent ID of the builder chat agent */
  builderAgentId: text("builder_agent_id"),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status"), // success | failure | running
  runCount: integer("run_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const automationRuns = sqliteTable("automation_runs", {
  id: text("id").primaryKey(),
  automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // running | success | failure
  output: text("output"), // JSON or text output
  error: text("error"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
})

export const automationSkills = sqliteTable("automation_skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** Path to the skill script on disk */
  scriptPath: text("script_path").notNull(),
  createdAt: text("created_at").notNull(),
})

export const wrappedSummaries = sqliteTable("wrapped_summaries", {
  id: text("id").primaryKey(),
  periodKey: text("period_key").notNull().unique(),
  summary: text("summary").notNull(),
  statsJson: text("stats_json").notNull(),
  createdAt: text("created_at").notNull(),
})
