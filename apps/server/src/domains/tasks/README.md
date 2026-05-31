# tasks

The server-side surface for the task tracker: HTTP routes for the task tree, CRUD, task↔agent linkage, comments, sibling dependencies, Jira sync / transition / connectivity status, the refinement chat flow that runs against a hidden Claude agent, and the start-work flow that spawns a working agent + worktree when a task moves to "ready".

## Owns

- All task-related HTTP endpoints: `GET /api/tasks` (tree), `POST /api/tasks` (create), `PATCH /api/tasks/:id` (update, with auto-start-work on transition to `ready`), `DELETE /api/tasks/:id` (recursive), `POST/DELETE /api/tasks/:id/agents/:agentId` (link/unlink), `POST /api/tasks/:id/comments`, `POST/DELETE /api/tasks/:id/dependencies/:depId`, `POST /api/tasks/sync` (Jira import), `POST /api/tasks/:id/jira-transition`, `GET /api/tasks/jira-status`, `POST /api/tasks/:id/reply` (refine chat turn), and `POST /api/tasks/:id/start-work` (spawn a working agent + worktree).
- The Jira client + sync logic: REST API wrapper (`searchIssues`, `transitionIssue`, `testConnection`, sprint custom-field discovery), `acli` fallback (`runAcli`, `runAcliView`), ADF → Markdown description conversion, status-category mapping, two-pass parent/subtask upsert plus a third pass that fetches children of parent tasks not returned by the original JQL.
- The refine flow: hidden agents flagged with `taskId`, filtered from the sidebar, reused across follow-up messages, with a domain-specific system prompt that documents the `<huxflux:tasks.*>` XML tags the agent can emit.
- The task-agents linkage table: read/write via the linkage endpoints and via the start-work flow when it creates a new agent for a task.
- The `task:updated` / `task:comment` WebSocket events emitted from this domain's route handlers (and also from the runner's tag-handler dispatch when an assistant message contains a `<huxflux:tasks.*>` directive — those handlers live in `runnerTags.ts` and are registered by call sites such as `routes/refine.routes.ts`).
- The agent-runner tag handlers in `service/runnerTags.ts` (`tasks.comment`, `tasks.update`, `tasks.create`, `tasks.status`, `tasks.dependency`), exported via `runnerTags.ts`.

## Public surface

- `tasks.routes.ts` — exposes `tasksPlugin`, the Fastify plugin registering every task-related HTTP route. Wired through the registry at `src/domains/index.ts`.
- `jiraClient.ts` — re-exports `jiraTransitionIssue` (Jira REST API helper for transitioning an issue) from `service/jiraClient.ts`. Used by the poller when an associated PR is merged.
- `runnerTags.ts` — re-exports the agent-runner `TagHandler` factories for `tasks.comment`, `tasks.update`, `tasks.create`, `tasks.status`, `tasks.dependency`. Consumed by any `runAgent` call site that wants to surface task mutations.
- `tasks.ws.ts` — typed event builder `tasksWs` (`taskUpdated`, `taskComment`) and the `TasksServerEvent` union. Consumed by `src/domains/ws/events.ts` to compose the central `ServerEvent`.

## Depends on

- `src/db/index.ts` — Drizzle handle (the `tasks`, `task_agents`, `task_comments`, `task_dependencies` Drizzle tables now live in this domain's own `tasks.db.ts`; cross-domain `agents` and `repos` tables are imported from their owning domains' `<domain>.db.ts` via the schema barrel)
- `src/domains/ws/handler.ts` — `broadcast` (every connection) used by mutating routes to emit `task:updated`
- `src/domains/git/worktrees.ts` — `createWorktree` (dynamically imported by the start-work flow)
- `src/domains/agent-runner/agent-runner.service.ts` — `runAgent` (used by the refine flow and the start-work flow to send the first turn)
- `src/domains/agent-runner/agent-runner.types.ts` — `TagHandler` (the interface every entry in `runnerTags.ts` implements)
- `src/domains/settings/settings.service.ts` — `getSettings` (Jira credentials + `defaultModel` + `defaultProvider`)
- `src/config.ts` — `boundPort`, `authToken` (used by the PATCH auto-start path that calls `/api/tasks/:id/start-work` over loopback HTTP)
- `@huxflux/shared` — `TaskItem`, `TaskComment`, `TaskStatus`, `TasksServerEvent` (the wire-shape; the server's "*Out" variants live in `tasks.types.ts` and mirror these)
- `drizzle-orm`, `fastify`, `uuid` — runtime
- `node:child_process` (`execFile` for `acli`), `node:os`, `node:path` — system

## Sub-domains

None.

## Quirks

- The 955-line `routes/tasks.ts` was split by request shape: `list.routes.ts` (the tree GET), `crud.routes.ts` (create / update / delete), `agents.routes.ts` (link / unlink), `comments.routes.ts`, `dependencies.routes.ts`, `jira.routes.ts` (sync / transition / status), `refine.routes.ts` (the `/reply` chat turn), and `startWork.routes.ts` (the agent-spawn endpoint). The 150-line `jira/client.ts` moved verbatim into `service/jiraClient.ts`; the `apps/server/src/jira/` directory has been removed.
- The Jira sync flow was a single 118-line route handler. It is split into helpers in `service/jiraSync.ts`: `partitionIssues`, `resolveSubtaskParents` (per-subtask `acli view` calls when the REST API isn't configured), `fetchMissingParents`, and `syncChildrenOfParents` (which is a no-op when only acli is available — `parent in (...)` JQL isn't supported on every Jira instance). The route itself composes those into the three-pass parents → subtasks → children sync.
- The ADF → Markdown converter (`service/adfToMarkdown.ts`) is the one place in the codebase that touches Atlassian Document Format. Inline mark rendering was extracted to a `renderInlineNode` helper so `adfInline` stays under the 80-line cap; the original was an inline `.map((n: any) => { ... })` that exceeded the per-function limit. The `case "blockquote"` block is wrapped in `{ }` to satisfy `no-case-declarations` (the legacy file ran in a legacy-path softening rule); behaviour is identical.
- The PATCH `/api/tasks/:id` route auto-fires `POST /api/tasks/:id/start-work` over loopback HTTP when the task moves from any status to `ready` and has a repo + no existing agent. It uses internal HTTP (not a direct service call) so the start-work flow can change without breaking the auto-start path. Preserved verbatim from the source.
- The start-work route's system prompt is computed but never passed to the runner — the initial turn uses only `Implement the following task: ...`. The dead computation is preserved (with a `void ctx` discard to silence the unused-var warning) so the diff stays structural; wiring it through is a separate behaviour change.
- The refine flow uses a hidden agent (`taskId` column set, no worktree). The runner `cwd` falls back from the task's repo path → the first available repo's path → the user's home dir, so `runAgent` always has a valid project context to run in.
- The Jira client exports a singleton `cachedSprintFieldId` for the custom Sprint field id. It's looked up once per process and never invalidated — restart the server if the Jira admin renames or reassigns the field. Preserved verbatim from the source.
- The Jira sync handler returns a `{ error }` object on auth / not-installed / generic failure (the route does NOT throw). The web client treats that as a soft failure and surfaces the message; preserving that envelope is why the route's `fetchInitialIssues` helper returns `{ issues } | { error }` instead of throwing.
- The PR job (in the pull-requests domain) imports the Jira transition helper as a static import. The single exported name is `jiraTransitionIssue` — renamed from the local `transitionIssue` so the public surface reads correctly out of context. (Previously this was a dynamic `await import("./domains/tasks/index.js")` from the monolithic `src/poller.ts`; once the job moved into the pull-requests domain, the import direction is clean and a static import works.)
- This domain owns the Jira-sync poller (`tasksJob` in `tasks.job.ts`). It hits the local `POST /api/tasks/sync` endpoint instead of calling the service directly so route-level validation and audit logging kick in. Composed into the central registry at `src/jobs.ts`.
- The `task:comment` and `task:updated` WS events are emitted by both this domain (mutating routes) and by the tag handlers in `service/runnerTags.ts` when an assistant emits a `<huxflux:tasks.*>` directive. The event shapes are declared here (`tasks.ws.ts`) because tasks own the schema.
- Task tree assembly was a single 92-line `buildTaskTree` function. It is split into `groupComments`, `groupAgents`, `groupDeps`, `buildTaskItem`, and `toAgentOut` so every function stays under the 80-line cap. The output is identical.
