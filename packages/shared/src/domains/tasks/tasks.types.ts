// Cross-platform Zod schemas for the tasks domain. The server validates
// request bodies against the `*BodySchema` exports; the client validates
// JSON responses against `taskItemSchema` (and arrays of it) via
// `reqValidated()` in `./api.ts`.

import { z } from "zod/v4"
import { agentStatusSchema } from "../agents/agents.types.js"

// ── TaskStatus ───────────────────────────────────────────────────────────────

export const taskStatusSchema = z.enum([
  "backlog",
  "refining",
  "ready",
  "in-progress",
  "in-review",
  "done",
])

export type TaskStatus = z.infer<typeof taskStatusSchema>

// ── TaskComment ──────────────────────────────────────────────────────────────

export const taskCommentRoleSchema = z.enum(["ai", "user"])

export type TaskCommentRole = z.infer<typeof taskCommentRoleSchema>

export const taskCommentSchema = z.object({
  id: z.string(),
  author: z.string(),
  role: taskCommentRoleSchema,
  content: z.string(),
  agentId: z.string().nullish(),
  createdAt: z.string(),
})

export type TaskComment = z.infer<typeof taskCommentSchema>

// ── TaskAgent ────────────────────────────────────────────────────────────────

export const taskAgentCIStatusSchema = z.enum(["passing", "failing", "pending"]).nullable()

export type TaskAgentCIStatus = z.infer<typeof taskAgentCIStatusSchema>

export const taskAgentSchema = z.object({
  agentId: z.string(),
  agentTitle: z.string(),
  agentStatus: agentStatusSchema,
  agentBranch: z.string(),
  prNumber: z.number().nullish(),
  prUrl: z.string().nullish(),
  prMerged: z.boolean().optional(),
  prDraft: z.boolean().optional(),
  ciStatus: taskAgentCIStatusSchema.optional(),
})

export type TaskAgent = z.infer<typeof taskAgentSchema>

// ── TaskItem (recursive) ─────────────────────────────────────────────────────
// `subtasks: TaskItem[]` makes the structure self-referential. Use `z.lazy()`
// with an explicit `z.ZodType<TaskItem>` annotation so TS can resolve the
// circular type.

export interface TaskItem {
  id: string
  parentId: string | null
  jiraKey: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: string | null
  assignee: string | null
  projectKey: string | null
  repoId?: string | null
  repoName?: string | null
  refineAgentId?: string | null
  agents: TaskAgent[]
  comments: TaskComment[]
  subtasks: TaskItem[]
  // IDs of sibling tasks this depends on.
  dependencies?: string[]
  sprintName?: string | null
  sprintState?: string | null
  createdAt: string
  updatedAt: string
}

export const taskItemSchema: z.ZodType<TaskItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    parentId: z.string().nullable(),
    jiraKey: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: taskStatusSchema,
    priority: z.string().nullable(),
    assignee: z.string().nullable(),
    projectKey: z.string().nullable(),
    repoId: z.string().nullish(),
    repoName: z.string().nullish(),
    refineAgentId: z.string().nullish(),
    agents: z.array(taskAgentSchema),
    comments: z.array(taskCommentSchema),
    subtasks: z.array(taskItemSchema),
    dependencies: z.array(z.string()).optional(),
    sprintName: z.string().nullish(),
    sprintState: z.string().nullish(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
)

// ── Request bodies (server-validated) ────────────────────────────────────────

export const createTaskBodySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignee: z.string().optional(),
  projectKey: z.string().optional(),
  parentId: z.string().optional(),
  jiraKey: z.string().optional(),
  repoId: z.string().optional(),
})

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>

// PATCH-style update body. Every field is optional and may be null where the
// underlying column accepts null (e.g. description / priority / assignee /
// repoId — these can be cleared by passing null explicitly). The server also
// accepts `projectKey` / `jiraKey` patches but no client sends them today;
// they're listed here so the server-side schema accepts the same shape the
// previous untyped `req.body as Partial<{...}>` cast did.
export const updateTaskBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  projectKey: z.string().nullable().optional(),
  jiraKey: z.string().nullable().optional(),
  repoId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
})

export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>

export const linkTaskAgentBodySchema = z.object({
  agentId: z.string(),
})

export type LinkTaskAgentBody = z.infer<typeof linkTaskAgentBodySchema>

export const addTaskCommentBodySchema = z.object({
  author: z.string(),
  role: z.string(),
  content: z.string(),
})

export type AddTaskCommentBody = z.infer<typeof addTaskCommentBodySchema>

export const syncTasksBodySchema = z.object({
  jql: z.string().optional(),
})

export type SyncTasksBody = z.infer<typeof syncTasksBodySchema>

export const transitionTaskBodySchema = z.object({
  status: z.string(),
})

export type TransitionTaskBody = z.infer<typeof transitionTaskBodySchema>

export const refineTaskBodySchema = z.object({
  content: z.string(),
})

export type RefineTaskBody = z.infer<typeof refineTaskBodySchema>

// `POST /api/tasks/:id/start-work` is body-less. The server derives the
// model / provider / repo from the task row itself; no client-supplied
// overrides are honored, so no schema is needed.

export const addTaskDependencyBodySchema = z.object({
  dependsOnTaskId: z.string(),
})

export type AddTaskDependencyBody = z.infer<typeof addTaskDependencyBodySchema>

// ── WebSocket events emitted by the tasks domain ────────────────────────────
// Composed into the top-level `ServerEvent` union in `../../ws.ts`.

export type TasksServerEvent =
  | { type: "task:comment"; taskId: string; comment: TaskComment }
  | { type: "task:updated"; taskId: string }
