import { z } from "zod/v4"
import { reqValidated } from "../../apiBase.js"
import {
  taskItemSchema,
  createTaskBodySchema,
  updateTaskBodySchema,
  linkTaskAgentBodySchema,
  addTaskCommentBodySchema,
  syncTasksBodySchema,
  transitionTaskBodySchema,
  refineTaskBodySchema,
  addTaskDependencyBodySchema,
  type CreateTaskBody,
  type UpdateTaskBody,
  type AddTaskCommentBody,
} from "./tasks.types.js"

// The server returns `{ ok: true }` on success and `{ error, localUpdated }`
// on failure. The client signature predates `localUpdated`; we accept it so
// the response validates but it's stripped on the consumer's type surface.
const transitionResponseSchema = z.object({
  ok: z.boolean().optional(),
  error: z.string().optional(),
  localUpdated: z.boolean().optional(),
})

const jiraStatusResponseSchema = z.object({
  method: z.string(),
  ok: z.boolean(),
  displayName: z.string().optional(),
  error: z.string().optional(),
})

const startWorkResponseSchema = z.object({
  agentId: z.string(),
  tasks: z.array(taskItemSchema),
})

// /api/tasks/sync can return either a task array (success) or an error object
// (Jira misconfigured). Express both branches as a union and let the caller
// discriminate.
const syncResponseSchema = z.union([
  z.array(taskItemSchema),
  z.object({ error: z.string() }),
])

export const tasksApi = {
  // Tasks
  list: () => reqValidated(z.array(taskItemSchema), "/api/tasks"),
  create: (body: CreateTaskBody) =>
    reqValidated(z.array(taskItemSchema), "/api/tasks", {
      method: "POST",
      body: JSON.stringify(createTaskBodySchema.parse(body)),
    }),
  update: (id: string, body: UpdateTaskBody) =>
    reqValidated(z.array(taskItemSchema), `/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateTaskBodySchema.parse(body)),
    }),
  delete: (id: string) =>
    reqValidated(z.array(taskItemSchema), `/api/tasks/${id}`, { method: "DELETE" }),
  linkAgent: (taskId: string, agentId: string) =>
    reqValidated(z.array(taskItemSchema), `/api/tasks/${taskId}/agents`, {
      method: "POST",
      body: JSON.stringify(linkTaskAgentBodySchema.parse({ agentId })),
    }),
  unlinkAgent: (taskId: string, agentId: string) =>
    reqValidated(z.array(taskItemSchema), `/api/tasks/${taskId}/agents/${agentId}`, { method: "DELETE" }),
  addComment: (taskId: string, body: AddTaskCommentBody) =>
    reqValidated(z.array(taskItemSchema), `/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify(addTaskCommentBodySchema.parse(body)),
    }),
  sync: (jql?: string) =>
    reqValidated(syncResponseSchema, "/api/tasks/sync", {
      method: "POST",
      body: JSON.stringify(syncTasksBodySchema.parse({ jql })),
      timeoutMs: 30_000,
    }),
  transition: (taskId: string, status: string) =>
    reqValidated(transitionResponseSchema, `/api/tasks/${taskId}/jira-transition`, {
      method: "POST",
      body: JSON.stringify(transitionTaskBodySchema.parse({ status })),
    }),
  jiraStatus: () =>
    reqValidated(jiraStatusResponseSchema, "/api/tasks/jira-status"),
  // POST /api/tasks/:id/reply spawns / forwards a message to the hidden
  // "refine" agent for the task, so the wire shape is `{ agentId, tasks }`.
  // The client surface now mirrors that — callers get the new agent id back
  // alongside the refreshed task tree. (Previously this unwrapped to just
  // `tasks` and threw the agent id away; now both are returned so callers
  // can follow the agent if they want.)
  refine: (taskId: string, message?: string) =>
    reqValidated(startWorkResponseSchema, `/api/tasks/${taskId}/reply`, {
      method: "POST",
      body: JSON.stringify(refineTaskBodySchema.parse({
        content: message ?? "Please analyze this task and help me refine it. Explore the relevant code, then ask any clarifying questions.",
      })),
      timeoutMs: 60_000,
    }),
  // POST /api/tasks/:id/start-work takes no body. The server derives the
  // model / provider / repo from the task row itself. The previous client
  // signature accepted `{ model, provider, repoId }` overrides but the server
  // silently ignored them — drop them from the surface rather than ship a
  // promise the backend doesn't keep.
  startWork: (taskId: string) =>
    reqValidated(startWorkResponseSchema, `/api/tasks/${taskId}/start-work`, {
      method: "POST",
      timeoutMs: 30_000,
    }),
  replyToAgent: (taskId: string, content: string) =>
    reqValidated(startWorkResponseSchema, `/api/tasks/${taskId}/reply`, {
      method: "POST",
      body: JSON.stringify(refineTaskBodySchema.parse({ content })),
    }),
  addDependency: (taskId: string, dependsOnTaskId: string) =>
    reqValidated(z.array(taskItemSchema), `/api/tasks/${taskId}/dependencies`, {
      method: "POST",
      body: JSON.stringify(addTaskDependencyBodySchema.parse({ dependsOnTaskId })),
    }),
  removeDependency: (taskId: string, depId: string) =>
    reqValidated(z.array(taskItemSchema), `/api/tasks/${taskId}/dependencies/${depId}`, { method: "DELETE" }),
}
