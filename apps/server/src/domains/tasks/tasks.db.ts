import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { repos } from "../repos/repos.db.js"
import { agents } from "../agents/agents.db.js"

// Drizzle table definitions owned by the tasks domain: tasks, agent links,
// comments, and dependencies. References repos (optional repoId) and agents
// (task↔agent join) via direct relative imports from those domains' db.ts
// files. The centralized migration history lives in src/db/index.ts.

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
