# tasks

Cross-platform Zod schemas and API slice for the task / Jira integration surface. Owns the `TaskItem` tree shape and every `/api/tasks/*` endpoint used by the tasks view, refine view, and Jira sync flow.

## Owns

- The `TaskStatus`, `TaskComment`, `TaskAgent`, and `TaskItem` schemas (and inferred types) used by the tasks view, the refine view, and the mobile tasks list
- The `tasksApi` HTTP slice: CRUD, linking tasks to agents, comment add, Jira sync / transition / status probe, refine + start-work flows, dependency add / remove. Every JSON response is validated against the matching entity schema via `reqValidated()`.
- The `TasksServerEvent` WebSocket event union (`task:comment` / `task:updated`) composed into the top-level `ServerEvent` in `../../ws.ts`
- The request-body schemas (`createTaskBodySchema`, `updateTaskBodySchema`, `linkTaskAgentBodySchema`, `addTaskCommentBodySchema`, `syncTasksBodySchema`, `transitionTaskBodySchema`, `refineTaskBodySchema`, `addTaskDependencyBodySchema`) used by both the client api slice and the server routes

## Public surface

- `tasksApi` — task HTTP slice, merged into the composed `api` object at the package root
- `taskItemSchema` — Zod schema for the recursive task tree node; `TaskItem` is its inferred type
- `taskStatusSchema` — Zod enum schema for task lifecycle status; `TaskStatus` is its inferred type
- `taskCommentSchema` — Zod schema for a single comment on a task; `TaskComment` is its inferred type
- `taskCommentRoleSchema` — Zod enum schema for the comment-role union (`ai` / `user`); `TaskCommentRole` is its inferred type
- `taskAgentSchema` — Zod schema for an agent linked to a task (with PR + CI metadata); `TaskAgent` is its inferred type
- `taskAgentCIStatusSchema` — Zod enum schema for the CI-status union (`passing` / `failing` / `pending` / null); `TaskAgentCIStatus` is its inferred type
- `createTaskBodySchema` — Zod schema for `POST /api/tasks` body; `CreateTaskBody` is its inferred type
- `updateTaskBodySchema` — Zod schema for `PATCH /api/tasks/:id` body; `UpdateTaskBody` is its inferred type
- `linkTaskAgentBodySchema` — Zod schema for `POST /api/tasks/:id/agents` body; `LinkTaskAgentBody` is its inferred type
- `addTaskCommentBodySchema` — Zod schema for `POST /api/tasks/:id/comments` body; `AddTaskCommentBody` is its inferred type
- `syncTasksBodySchema` — Zod schema for `POST /api/tasks/sync` body; `SyncTasksBody` is its inferred type
- `transitionTaskBodySchema` — Zod schema for `POST /api/tasks/:id/jira-transition` body; `TransitionTaskBody` is its inferred type
- `refineTaskBodySchema` — Zod schema for `POST /api/tasks/:id/reply` body; `RefineTaskBody` is its inferred type
- `addTaskDependencyBodySchema` — Zod schema for `POST /api/tasks/:id/dependencies` body; `AddTaskDependencyBody` is its inferred type
- `TaskStatus` — task lifecycle status union
- `TaskComment` — single comment on a task (ai or user)
- `TaskCommentRole` — comment-role union
- `TaskAgent` — agent linked to a task (with PR + CI metadata)
- `TaskAgentCIStatus` — CI-status union
- `TaskItem` — full task tree node (recursive `subtasks`, agents, comments, dependencies)
- `TasksServerEvent` — WS event union emitted by the tasks domain on the server
- `CreateTaskBody` — request body for `POST /api/tasks`
- `UpdateTaskBody` — request body for `PATCH /api/tasks/:id`
- `LinkTaskAgentBody` — request body for `POST /api/tasks/:id/agents`
- `AddTaskCommentBody` — request body for `POST /api/tasks/:id/comments`
- `SyncTasksBody` — request body for `POST /api/tasks/sync`
- `TransitionTaskBody` — request body for `POST /api/tasks/:id/jira-transition`
- `RefineTaskBody` — request body for `POST /api/tasks/:id/reply` (refine + reply-to-agent share this body)
- `AddTaskDependencyBody` — request body for `POST /api/tasks/:id/dependencies`

## Depends on

- `../../apiBase` — `reqValidated` for the api slice
- `../agents/types` — `agentStatusSchema` and `AgentStatus` (referenced from `TaskAgent.agentStatus`)
- `zod` for the runtime schemas

## Sub-domains

None.

## Quirks

- `TaskItem` is recursive: `subtasks: TaskItem[]` lets the server return the whole tree in one call. The schema uses `z.lazy()` with an explicit `z.ZodType<TaskItem>` annotation so TS can resolve the circular type. Consumers should not assume depth.
- `refineTask` has a hard-coded default user message used when no `message` is provided. The 60s timeout accommodates the Claude refine round-trip.
- `refineTask`, `startTaskWork`, and `replyToTaskAgent` all return `{ agentId, tasks }` — the agent the task is now linked to plus the refreshed task tree. `refineTask` and `replyToTaskAgent` share the same `POST /api/tasks/:id/reply` endpoint; Part 2b of the rename will collapse them into one method.
- `startTaskWork` takes no overrides. The server derives the model / provider / repo from the task row itself, so passing them client-side was a misleading no-op; the surface no longer accepts them.
- `syncTasks` can return either `TaskItem[]` (success) or `{ error: string }` (Jira misconfigured); callers must discriminate. The response schema is a union (`z.union([taskItemArray, errorObject])`) and `reqValidated` accepts either branch.
- `getJiraStatus` returns the auth method used (`api-token` / `oauth` / `none`) plus `ok` and an optional human-readable error. Used by the Jira-settings panel to tell users what credentials they need.
- `transitionTask` may also return `{ error, localUpdated }` when the Jira transition fails but the local DB was updated; the schema accepts the optional `localUpdated` flag.
- The PATCH body accepts `projectKey` and `jiraKey` in addition to the fields the client today sends. The server preserves backwards compatibility with the old untyped `req.body as Partial<{...}>` cast.
- No hooks live in this domain yet. Task data is fetched via React Query in the consuming apps using the composed `api` object directly.
- `TaskAgent.agentStatus` is typed as `AgentStatus` (from `../agents/types`). This is the only cross-domain type reference in this slice — the inverse direction (agents importing from tasks) would not be appropriate.
