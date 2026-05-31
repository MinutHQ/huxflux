# agents

The server-side surface for agent orchestration: HTTP routes for agent CRUD, messaging, files, terminal output, terminal tabs, slash commands, plus the rename/title/message-queue/setup-script services that branch and worktree lifecycles depend on. The long-running provider CLI runner lives in the peer domain `src/domains/agent-runner/`.

## Owns

- The `/api/agents` REST surface: listing, single-agent snapshots, child sessions, port lookups, process kills, create-with-worktree, partial updates (including `rebase --onto` when `baseBranch` changes), branch switch / rename, stop, generate-title, soft delete, sync-files, ask/answer hook bridge, open-in launcher, worktree-path lookup, context-window probe, and `/api/providers` discovery
- The `/api/agents/:id/messages` REST surface plus the in-memory per-agent message queue that serializes turns when a previous run is still streaming
- The `/api/agents/:id/files/*` surface: file list, single-file diff, file tree, raw content, base content, batch diffs, and disk refresh
- The `/api/agents/:id/terminal` surface and `/api/agents/:id/terminal-tabs` CRUD (kills the PTY when a tab is deleted)
- The `/api/slash-commands` and `/api/agents/:id/slash-commands` surfaces with built-in commands plus skills discovered under `~/.claude/skills` and the project's `.claude/skills`
- The `/api/stats` workspace-wide stats surface used by HomeView: agent/message/tool-call/file-change totals plus a 30-day daily-agents activity chart
- The `/api/agents/:id/upload` chat-attachment surface: accepts a base64-encoded file, sanitises the filename, and persists it under the huxflux data dir (per-agent subdirectory, never inside the worktree)
- The shared types the runner consumes (`ClaudeStreamEvent`, `StreamState`, `RunnerOptions`) and the WS event union (`AgentsServerEvent`) the runner broadcasts on. The runner itself lives in the peer domain `src/domains/agent-runner/`.
- The title generation service (Haiku call + slug-cut fallback) and branch rename service (git branch -m + worktree move + Claude session-dir relocation)
- The WebSocket event types emitted by every agent-related code path (`agent:updated`, `agent:deleted`, `message:*`, `tool:*`, `terminal:line`, `subagent:event`, `file:changed`, `ask:question`, `ports:changed`)

## Public surface

Top-level `.ts` files in this domain are public; subfolders (`routes/`, `service/`) are private. Cross-domain consumers import from a specific top-level file.

- `agents.routes.ts` — exposes `agentsPlugin`, the Fastify plugin registering every agent-related HTTP route. Wired through the registry at `src/domains/index.ts`.
- `title.ts` — re-exports the title-generation service: `generateTitle`, `deriveTitle`, `titleToBranchSlug`.
- `rename.ts` — re-exports the branch-rename / worktree-relocate service: `applyBranchRename`, `isPlaceholderName`, `reconcileWorktreeLocation`.
- `agents.ws.ts` — typed event builder `agentsWs` and the `AgentsServerEvent` union. Consumed by `src/domains/ws/events.ts` to compose the central `ServerEvent`. Also consumed by `src/domains/agent-runner/`, which broadcasts agents events from inside the runner.
- `agents.types.ts` — `ClaudeStreamEvent`, `StreamState`, `RunnerOptions`, `CollectedToolCall`, `ClaudeContentBlock`, and other agent-runtime types. Consumed cross-domain by `src/domains/agent-runner/`.
- `agents.db.ts` — Drizzle table definitions (`agents`, `messages`, `tool_calls`, `file_changes`, `terminal_lines`, `terminal_tabs`, `agent_ports`, `worktree_pool`). Re-exported by `src/db/schema.ts` for cross-domain consumers.
- `agents.job.ts` — `agentsJob` (dead-port cleanup). Wired through `src/jobs.ts`.

## Depends on

- `src/db/index.ts` — shared Drizzle handle (the `agents`, `agent_ports`, `worktree_pool`, `messages`, `tool_calls`, `file_changes`, `terminal_lines`, `terminal_tabs` Drizzle tables now live in this domain's own `agents.db.ts`; the schema barrel still re-exports them for cross-domain consumers). Queries are inline in routes — there is no per-domain query helper module yet.
- `src/domains/git/{worktrees,watcher,pool,processes}.ts` — worktree lifecycle (`createWorktree`/`removeWorktree`/`moveWorktree`/`getFileChanges`/`getDiff*`/`getFileTree`/file content helpers), reserve pool (`claimReserve`), file watcher (`watchWorktree`/`unwatchWorktree`/`refreshWorktree`), port/process registry (`scanForPort`/`registerPort`/`clearAgentPorts`/`killWorktreeProcesses`).
- `src/domains/ws/handler.ts` — `emit` (per-agent) and `broadcast` (every connection).
- `src/domains/ws/pty.ts` — `killAgentTerminals`, `killTerminal`, `hasActivePty`.
- `src/domains/providers/{registry,types,context}.ts` — provider registry, `NormalizedStreamEvent`, `buildConversationContext`.
- `src/domains/pull-requests/{prStatus,prComments}.ts` — `findPRForBranch`, `parsePrStatus`, `replyToReviewComment`.
- `src/config.ts`, `src/settings.ts`, `src/sandbox.ts` — config, settings, sandbox command wrapping
- `simple-git`, `uuid`, `fastify`, `drizzle-orm` — runtime
- `node:child_process`, `node:fs`, `node:path`, `node:os` — system

## Sub-domains

None.

## Quirks

- The runner was previously a single 1340-line file. It is now its own domain at `src/domains/agent-runner/` (peer of this domain, not a sub-system), with one file per responsibility. The orchestrator (`agent-runner/agent-runner.service.ts`) is ~135 lines and reads top-to-bottom.
- `ClaudeStreamEvent` is defined here in `agents.types.ts` and consumed by the agent-runner domain. The previous flat file used `@ts-expect-error` at the call site because the type was never imported; the current code derives the union from the runner's field accesses (assistant blocks: text / thinking / tool_use; tool_result; result with usage; system with subtype init; unknown forwarded as subagent).
- DB queries live inline in the routes, mirroring the legacy `routes/*.ts` files. The Drizzle table definitions for this domain were co-located into `agents.db.ts` (the per-domain schema split); the central `src/db/schema.ts` is now a backward-compatible barrel that re-exports every domain's tables. Per-domain *query helpers* are still pending — when they're introduced they'll be the consumer of this `agents.db.ts`.
- This domain owns the dead-port-cleanup poller (`agentsJob` in `agents.job.ts`). It triggers `getAllPortsFromDB` from `src/domains/git` every 30 seconds; that call checks each recorded port with `lsof` and deletes records whose process is gone, as a side effect. Composed into the central registry at `src/jobs.ts`.
- `routes/*.routes.ts` carries no `any` casts of its own. The `agent as any` calls passed into `broadcast({ type: "agent:updated", agent })` are preserved verbatim from the source — the `agentsTable` Drizzle row is morally `AgentSummary` but the `streaming: 0 | 1` int vs `boolean` and the optional `prStatus: string | null` vs `PRStatus | undefined` make a straight assignment fail. Tightening this requires changing the WS event shape and the client and is left for a future commit.
- Branch rename in `service/rename.ts` carries `agent as any` casts on the broadcast calls for the same reason. Moved verbatim.
- The `simpleGit` default-export bug from commit 1 has been fixed: every callsite in this domain uses the named import (`import { simpleGit } from "simple-git"`).
- `"ports:changed"` is part of `AgentsServerEvent` even though it's broadcast from `src/domains/git/processes.ts`. That file lives in the `git` domain (it is paired with the worktree process lifecycle, not the agent lifecycle), but the event itself belongs to the agents domain's WS union. The `@ts-expect-error` patch at `processes.ts:89` has been removed because the event is now declared in the union.
- The `oldBase` variable in the original PATCH route's rebase code was computed but never used — the call to `resolveRef(oldBaseRaw)` is kept in `agents.update.routes.ts` (its result is dropped) so any "ref not found" failure still surfaces before the rebase attempt. The behaviour is unchanged.
- Message queueing lives in `service/messageQueue.ts` and uses a module-scoped `Map<agentId, QueuedMessage[]>`. The drain runs in `.finally()` so a thrown runner doesn't strand pending messages. Verbatim from the source.
- Runner-specific quirks (pre-spawn auto-rename, process-group SIGTERM/SIGKILL handling, `<huxflux:*>` tag handling) live in the `agent-runner` domain's README, not here.
