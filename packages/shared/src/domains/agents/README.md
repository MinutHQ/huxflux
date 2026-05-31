# agents

Cross-platform types, hooks, and API client slice for the agent / chat surface. Mirrors the app-side `agents` domain (web + mobile + server) and owns every shape the chat / sidebar / file-change consumers depend on.

## Owns

- The `Agent`, `AgentSummary`, `AgentStatus`, `Message`, `ToolCall`, `FileChange`, `SlashCommand`, and `WorkspaceStats` types consumed by every app
- The `statusConfig` / `statusOrder` lookups that map an `AgentStatus` to its label + design-system color tokens
- The `AgentsServerEvent` WebSocket event union — composed into the top-level `ServerEvent` in `../../ws.ts`
- The `agentsApi` HTTP slice: every `/api/agents/*` endpoint plus messages, files, terminal, terminal tabs, slash commands, agent-scoped upload, `/api/stats`, and the `/api/system/ssh-info` lookup that the agent "open in editor" flow uses
- The `useAgents` TanStack Query hook with WS reconciliation (sidebar list, hides refine agents, tombstones deletes)
- The `useAgent` TanStack Query hook with WS reconciliation (single-agent snapshot, live message / tool-call / file-change / terminal streaming, pendingQuestion surfacing, error-handler injection)
- The `isAgentStreaming` derivation used by every "is this agent live?" check on the client

## Public surface

- `agentsApi` — the agent HTTP slice, merged into the composed `api` object at the package root
- `useAgent` — single-agent React Query hook with WS reconciliation and message pagination
- `configureAgentErrorHandler` — registers a platform-specific handler for `error` events surfaced by `useAgent`
- `useAgents` — sidebar agent-list React Query hook with WS reconciliation
- `markAgentDeleted` — tombstone helper that prevents a late `agent:updated` from resurrecting a just-deleted agent
- `isAgentStreaming` — derives the streaming state from an agent's `streaming` flag plus the last assistant message's `durationMs`
- `statusConfig` — map from `AgentStatus` to `{ label, color, dotColor, hex }`
- `statusOrder` — canonical sort order for `AgentStatus` values
- `agentSchema` — Zod schema for the full `Agent` entity returned by `GET /api/agents/:id`
- `agentSummarySchema` — Zod schema for the lightweight `AgentSummary` entity returned by `GET /api/agents`
- `agentStatusSchema` — Zod schema for the `AgentStatus` enum
- `messageSchema` — Zod schema for a chat `Message` (covers both `user` and `assistant` roles)
- `toolCallSchema` — recursive Zod schema for a `ToolCall` (supports nested `subCalls` for sub-agent invocations)
- `fileChangeSchema` — Zod schema for a `FileChange` entry
- `slashCommandSchema` — Zod schema for a `SlashCommand` metadata entry
- `workspaceStatsSchema` — Zod schema for the workspace-level stats payload
- `fileTreeNodeSchema` — recursive Zod schema for a directory listing node
- `terminalTabSchema` — Zod schema for a terminal-tab row
- `agentPortEntrySchema` — Zod schema for one entry in `/api/ports` and the `ports:changed` WS event
- `agentContextSchema` — Zod schema for the `/api/agents/:id/context` response
- `agentFileDiffSchema` — Zod schema for one entry of the batched `/api/agents/:id/files/diffs` response
- `systemSshInfoSchema` — Zod schema for the `/api/system/ssh-info` response
- `createAgentBodySchema` — Zod schema for the `POST /api/agents` request body
- `updateAgentBodySchema` — Zod schema for the `PATCH /api/agents/:id` request body
- `sendMessageBodySchema` — Zod schema for the `POST /api/agents/:id/messages` request body
- `switchBranchBodySchema` — Zod schema for the `POST /api/agents/:id/switch-branch` request body
- `renameBranchBodySchema` — Zod schema for the `POST /api/agents/:id/rename-branch` request body
- `generateTitleBodySchema` — Zod schema for the `POST /api/agents/:id/generate-title` request body
- `askBodySchema` — Zod schema for the legacy `POST /api/agents/:id/ask` request body
- `answerBodySchema` — Zod schema for the `POST /api/agents/:id/answer` request body
- `saveFileContentBodySchema` — Zod schema for the `PUT /api/agents/:id/files/content` request body
- `openInBodySchema` — Zod schema for the `POST /api/agents/:id/open-in` request body
- `uploadFileBodySchema` — Zod schema for the `POST /api/agents/:id/upload` request body
- `terminalTabUpdateBodySchema` — Zod schema for the `PATCH /api/agents/:id/terminal-tabs/:terminalId` request body
- `Agent` — full agent shape (with `messages`, `fileChanges`, `terminalOutput`)
- `AgentSummary` — `Agent` without the heavy collections (sidebar / list view)
- `AgentStatus` — status string union
- `Message` — chat message shape (including transient client-only `pendingText`)
- `ToolCall` — tool invocation shape (with optional `subCalls` / `outputText` for sub-agent calls)
- `FileChange` — `{ path, additions, deletions }` shape used by the file panel
- `SlashCommand` — `/slash` command metadata returned by `/api/slash-commands`
- `WorkspaceStats` — aggregated lifetime stats returned by `/api/stats`
- `FileTreeNode` — recursive directory-tree node returned by `/api/agents/:id/files/tree`
- `TerminalTab` — single row from the terminal-tabs API
- `AgentPortEntry` — `{ agentId, agentTitle, port }` entry shape
- `AgentContext` — context-window usage payload
- `AgentFileDiff` — batched-file-diffs entry shape
- `SystemSshInfo` — SSH-info payload for open-in-editor
- `CreateAgentBody` — request-body type for `POST /api/agents`
- `UpdateAgentBody` — request-body type for `PATCH /api/agents/:id`
- `SendMessageBody` — request-body type for `POST /api/agents/:id/messages`
- `SwitchBranchBody` — request-body type for `POST /api/agents/:id/switch-branch`
- `RenameBranchBody` — request-body type for `POST /api/agents/:id/rename-branch`
- `GenerateTitleBody` — request-body type for `POST /api/agents/:id/generate-title`
- `AskBody` — request-body type for the legacy `POST /api/agents/:id/ask` hook endpoint
- `AnswerBody` — request-body type for `POST /api/agents/:id/answer`
- `SaveFileContentBody` — request-body type for `PUT /api/agents/:id/files/content`
- `OpenInBody` — request-body type for `POST /api/agents/:id/open-in`
- `UploadFileBody` — request-body type for `POST /api/agents/:id/upload`
- `TerminalTabUpdateBody` — request-body type for `PATCH /api/agents/:id/terminal-tabs/:terminalId`
- `AgentsServerEvent` — WS event union emitted by the agents domain on the server

## Depends on

- `@huxflux/tokens` — `statusColors` for `statusConfig`
- `../../api` — composed `api` object (for `agentsApi` consumers via React Query in hooks)
- `../../apiBase` — `req`, `getApiBase`, `authHeaders` for the api slice
- `../../ws` — `useAgentEvents` for WS subscription
- `../servers` — `getActiveServer` (for the `useAgents` query key)
- `../pull-requests/types` — `PRStatus` (referenced from `Agent.prStatus`)
- `react`, `@tanstack/react-query` — hook runtime

## Sub-domains

None.

## Quirks

- `useAgent` is a thin orchestrator (`hooks/useAgent.ts`) over per-concern hooks that each handle one slice of WS-driven state: `useAgentQuery` (fetch + sub-agent merge), `useAgentPagination` (loadMore / hasMore), `useAgentMessageStream` (message / tool / subagent frames), `useAgentFileChanges`, `useAgentTerminal`, `useAgentPendingQuestion`, `useAgentLifecycle` (agent:updated / ws:reconnected / error). Each sub-hook returns a stable `handleEvent` callback so the orchestrator subscribes to `useAgentEvents` exactly once and dispatches by event type. Pure reducer helpers live alongside in `messageStreamReducers.ts` and `subagentEventReducer.ts`. None of the sub-hooks are public; consumers still call `useAgent` and get the same return shape.
- `Agent.prStatus` is typed as `PRStatus` (from `../pull-requests/types`). This is the one cross-domain type reference in this domain — moving `PRStatus` into agents would invert the semantic ownership. The pull-requests domain owns the type; the agents domain just references it on its own type.
- `agentsApi` includes `systemSshInfo` because the agent open-in-editor flow is the only consumer. If a future consumer outside agents needs SSH info, the method should move to its own slice; for now this avoids a one-method "system" domain.
- `agentsApi` includes `uploadFile` (agent-scoped chat attachments). It's part of the chat surface, not a generic file upload — keep it here.
- The client-side sub-agent merge map (`subAgentDataRef`) is owned by `useAgentQuery` and threaded into `useAgentMessageStream`. It's per-hook instance (resets on agent switch) and merges into both the `select` and `message:done` paths so refetches don't drop sub-agent data.
- `_onError` is a module-level mutable for the platform-injected error handler. `configureAgentErrorHandler` is called once during app bootstrap (web: toast; mobile: alert).
- `useAgents` and `useAgent` both subscribe to `ws:reconnected` and invalidate their queries — the WS event union owns this signal even though it isn't an agents event.
- The agents domain re-uses the top-level `useAgentEvents` from `../../ws.ts` rather than its own subscriber, because the WS connection is global and the event union is composed (every domain that emits events contributes to the same union).
