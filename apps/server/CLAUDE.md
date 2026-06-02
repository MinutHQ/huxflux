# apps/server — Agent Rules

Node + Fastify + Drizzle SQLite. The orchestrator backend.

Read the root CLAUDE.md first.

## Layout

```
src/
  domains/<name>/    Feature code. Each domain owns its routes, db slice, service, types.
  domains/index.ts   Plugin registry — every domain's Fastify plugin appended here.
                     This is NOT a per-domain barrel (those were retired); it's the
                     cross-domain registry that composes the server.
  domains/ws/        WebSocket transport domain: connection lifecycle, the typed
                     event-builder factory, composed `ServerEvent` union, and the
                     PTY socket. Domains contribute event types from their own <name>.ws.ts.
  db/                Drizzle schema and migration entrypoint. Shared across domains.
  index.ts           Server entrypoint.
  cli.ts             CLI commands.
  config.ts          Config loading.
  auth.ts            Auth middleware.
  audit.ts           Audit logging.
  sandbox.ts         Sandbox execution.
  jobs.ts            Background-job registry. Each domain's `domains/<x>/<x>.job.ts`
                     exports a `Job` (see `jobTypes.ts`); this file lists them and
                     `startJobs()` boots them all.
  jobTypes.ts        The `Job` interface.
  types.ts           Cross-cutting types.
  settings.ts        Settings storage.
```

Endpoints live in `src/domains/<name>/<name>.routes.ts`. There is no flat `routes/` directory anymore: every server-side feature now lives in a domain. New endpoints go in their domain's `<name>.routes.ts`.

## What stays flat at src root

Single-file utilities (`auth.ts`, `audit.ts`, `sandbox.ts`, `config.ts`, `jobs.ts`, `jobTypes.ts`, `types.ts`) stay flat. Promoting them to `domains/<name>/` would mean a README for under 100 lines of code, so the boundary benefit does not outweigh the overhead.

`db/` stays flat: per-domain pieces already live in `domains/<x>/<x>.db.ts`, so the root directory is just the runtime kernel (migration runner plus schema barrel). The WebSocket plumbing graduated to a real domain at `src/domains/ws/`.

Anything substantial enough to have its own public surface gets a domain. `domains/git` (worktree lifecycle, diffs, watcher, reservation pool, process / port registry) is the reference case for that promotion: 4 files, ~27 exports, consumed by three other domains plus the server entrypoint and PTY hook.

## Domain shape (server side)

```
domains/<name>/
  README.md
  <name>.routes.ts  Fastify plugin that composes this domain's HTTP endpoints. Top-level
                    file = public surface (cross-domain consumers import `<name>Plugin`
                    from here; the registry below picks it up).
  <Public>.ts       Thin re-exporter files when a public symbol lives in a private
                    subfolder. Examples: `title.ts` re-exports `service/title.ts`,
                    `prStatus.ts` re-exports `service/prStatus.ts`. The file IS the
                    public-surface declaration; the subfolder is internal. Function-
                    specific re-exporters keep their bare descriptive name (not the
                    `<domain>.<layer>.ts` form).
  routes/           Optional. Per-feature route files when one big plugin gets too big.
                    Private to the domain.
  service/          Business logic. Pure where possible. Private to the domain.
  <name>.db.ts      Drizzle table definitions owned by this domain, and (optionally)
                    queries scoped to this domain. Cross-domain tables are imported via
                    relative paths (e.g. `from "../agents/agents.db.js"`) or via the
                    `src/db/schema.ts` barrel, which re-exports every table from every
                    domain for backward compatibility.
  <name>.types.ts   Domain-internal types. Top-level = public.
  <name>.ws.ts      WS event union for this domain. Imported by `domains/ws/events.ts`.
  <name>.job.ts     Background scheduled job (optional). Exports a `Job` (see
                    `src/jobTypes.ts`); registered in `src/jobs.ts`.
```

Per-domain `index.ts` barrels do not exist. The public surface is the set of top-level files; everything in a subfolder is internal. See the root CLAUDE.md "Public Surface Rule" section.

## Auto-registration

`src/domains/index.ts` exports `domainPlugins: FastifyPluginAsync[]`. The server entrypoint loops over it once. To register a new domain, append `<name>Plugin` to that array — the only place the registry learns about a domain plugin. The registry imports each plugin directly from the domain's `<name>.routes.ts` (no per-domain barrel).

## Concrete example: the agents and agent-runner domains

The agents domain owns the HTTP surface, WS events, DB tables, and the title / rename / message-queue / setup-script services. The execution engine for a single agent turn lives as a peer domain at `agent-runner/`, so the agent-resource shape is not coupled to the (much larger) runner internals.

```
domains/agents/
  README.md
  agents.routes.ts                  — agentsPlugin (composes sub-plugins). Public surface.
  title.ts                          — public re-exporter for service/title.ts
  rename.ts                         — public re-exporter for service/rename.ts
  agents.ws.ts                      — AgentsServerEvent union. Public surface.
  agents.types.ts                   — ClaudeStreamEvent, StreamState, RunnerOptions, etc.
  agents.db.ts                      — Drizzle table definitions (agents, messages, tool_calls,
                                      file_changes, terminal_lines, terminal_tabs, agent_ports,
                                      worktree_pool)
  agents.job.ts                     — agentsJob (dead-port cleanup; see jobs.ts)
  routes/
    agents.routes.ts                — composes the agent-resource sub-plugins
    agents.list.routes.ts           — GET /api/agents, GET /api/agents/:id, ports, sessions
    agents.create.routes.ts         — POST /api/agents (worktree + setup)
    agents.update.routes.ts         — PATCH /api/agents/:id (with rebase --onto)
    agents.branch.routes.ts         — switch-branch / rename-branch / stop / generate-title
    agents.lifecycle.routes.ts      — DELETE / sync-files / kill-processes
    agents.misc.routes.ts           — ask/answer / open-in / worktree-path / context / providers
    messages.routes.ts              — GET/POST /api/agents/:id/messages
    files.routes.ts                 — /api/agents/:id/files/*
    terminal.routes.ts              — GET /api/agents/:id/terminal
    terminalTabs.routes.ts          — /api/agents/:id/terminal-tabs/*
    slashCommands.routes.ts         — /api/slash-commands
  service/
    title.ts                        — generateTitle / deriveTitle / titleToBranchSlug
    rename.ts                       — applyBranchRename / reconcileWorktreeLocation
    messageQueue.ts                 — per-agent in-memory turn queue
    setupScript.ts                  — sh script runner that streams output as terminal lines
```

```
domains/agent-runner/
  README.md
  agent-runner.service.ts           — public surface: runAgent (turn entrypoint), plus
                                      runningProcesses, isAgentRunning, stopAgent,
                                      resetStreamingFlags, getClaudeBin, resolveModelAlias
  agent-runner.types.ts             — public surface: ParsedTag, TagHandler, RunAgentOptions
  agent-runner.service.test.ts      — end-to-end test for runAgent (sits next to the public
                                      surface; uses the fake-claude binary fixtures)
  service/
    state.ts                        — createStreamState
    processRegistry.ts              — runningProcesses, stopAgent, isAgentRunning,
                                      resetStreamingFlags, getClaudeBin, resolveModelAlias
    bootstrapTurn.ts                — pre-spawn setup: persist user msg, mark streaming,
                                      pre-rename, cwd/session resolution
    systemPrompt.ts                 — domain-free system prompt scaffolding builder
    streamLoop.ts                   — spawn plus stdout/stderr to handleStreamEvent
    finalize.ts                     — idempotent exit handler
    claudeStreamEvent.ts            — Claude-format event handler
    normalizedEvent.ts              — provider-agnostic NormalizedStreamEvent handler
    tagParser.ts                    — generic <huxflux:NAMESPACE.KIND> parser + dispatcher
    autoRename.ts                   — placeholder-name auto-rename fallback
    persistMessage.ts               — final-content assembly, tag dispatch, DB writes,
                                      message:done emit
    fileChanges.ts                  — refreshFileChanges
```

Per-tag handler implementations live in their owning consumer domains (`agents/runnerTags.ts`, `tasks/runnerTags.ts`, `pull-requests/runnerTags.ts`, `automations/runnerTags.ts`) and are composed at each `runAgent` call site. The runner itself has zero domain coupling.

## Routes

- One Fastify plugin per domain, registered via `src/domains/index.ts`.
- Route handler files stay thin: parse request, call service, return response.
- Validation via Fastify schemas — never trust client input.
- Each route plugin is a `FastifyPluginAsyncZod` (from `fastify-type-provider-zod`). Declare `schema: { body, params, querystring, response }` on each route using the Zod schemas in `@huxflux/shared` (or local ones for params/querystrings). Fastify auto-validates the inputs before the handler runs and the type of `req.body` / `req.params` / `req.query` flows from the schema, so no `.parse()` call inside the handler is needed.

## API docs

`/docs` serves an interactive Swagger UI. `/docs/json` serves the raw OpenAPI 3.x spec. Both are public (no auth required) because they only expose the API shape, not data. The spec is derived from the Zod schemas registered on each route via the type provider, so adding a `schema` to a new route automatically documents it. To regenerate the docs there is nothing to run — they are live.

## Database

- Drizzle table definitions live per-domain in `domains/<x>/<x>.db.ts`. `src/db/schema.ts` is now a barrel that re-exports every domain's tables so existing `from "@/db/schema"` imports keep working. New code may import directly from a domain's `<x>.db.ts`, or from the barrel when it needs tables across multiple domains.
- The migration runner in `src/db/index.ts` calls `import * as schema from "./schema.js"` — that keeps working because the barrel preserves every name.
- Queries live per-domain in `domains/<x>/<x>.db.ts`. Do not query the database from routes.

## Migrations

**The project uses a hand-rolled migration runner, NOT drizzle-kit.** Ignore the `db:generate` / `db:migrate` scripts in `package.json` — they exist but aren't part of the active flow. The actual migration system lives in `src/db/index.ts`:

- A `MIGRATIONS` array holds `{ version, sql }` entries.
- A `schema_version` table tracks the highest applied version.
- `runMigrations()` runs every migration whose version is greater than the stored value, in order, on server boot.

**To change the schema (add/drop/modify a column or table):**

1. Edit `src/db/schema.ts` — update the Drizzle table definition so the TS types match the new shape. (Drizzle ignores extra columns in the DB, so this alone won't break runtime, but the types must reflect what's correct going forward.)
2. Append a new entry to the `MIGRATIONS` array in `src/db/index.ts` with the next version number. The `sql` is raw SQLite executed verbatim. Use semicolons to separate multiple statements.
3. Never edit an existing migration entry. Existing installs won't re-run them — they'd silently diverge from new installs.
4. Update consumers (API routes, services, types in `src/types.ts` and `packages/shared/src/types.ts`) to match the new shape.

**SQLite caveats for `ALTER TABLE`:**

- `ADD COLUMN` works. Can't add `NOT NULL` without a `DEFAULT`.
- `DROP COLUMN` works on SQLite 3.35+. Fine here.
- Can't rename columns inline; do `ADD COLUMN new` + data copy + `DROP COLUMN old`.
- For complex changes, the safe pattern is: create a new table, copy rows, drop the old, rename the new.

**Don't:**

- Run `drizzle-kit generate` and commit the output — it'll produce migration files in a format the runtime doesn't read.
- Forget to bump the version number. Two migrations with the same version means the second never runs. The `check-migrations` script (runs as part of `pnpm lint`) catches duplicate or out-of-order versions.
- Drop a column without updating every consumer (Drizzle schema, server types, shared types, API route body handling, web UI).

## WebSocket

- `src/domains/ws/` owns the connection lifecycle (it is a domain in its own right).
- Per-domain WS events go in `domains/<x>/<x>.ws.ts`.
- Event types are shared with the client via `@huxflux/shared`.

### Typed event builders (`defineEvents`)

Each domain declares its events as a config map passed to `defineEvents` (`src/domains/ws/define.ts`). The factory returns a typed callable — call sites use `agentsWs.agentUpdated(agent)` instead of hand-writing `broadcast({ type: "agent:updated", agent })`. The event-name string is enforced by the builder, the payload shape is inferred from the `build` function's signature, and the channel (`broadcast` vs `emit`) is baked into the config so call sites can't pick the wrong one.

```ts
// domains/<x>/<x>.ws.ts
import { defineEvents, type InferEvents } from "../ws/define.js"

const myEventsConfig = {
  // Broadcast: payload goes to every connected socket.
  somethingUpdated: {
    channel: "broadcast",
    build: (item: Item) => ({ type: "something:updated" as const, item }),
  },
  // Emit: first positional arg is the agentId used to route the message.
  // It is consumed by the factory and is NOT required to appear in the payload.
  messageStart: {
    channel: "emit",
    build: (agentId: string, messageId: string) =>
      ({ type: "message:start" as const, agentId, messageId }),
  },
} as const

export const myWs = defineEvents(myEventsConfig)
export type MyServerEvent = InferEvents<typeof myEventsConfig>
```

Then in any call site:

```ts
import { myWs } from "../<name>.ws.js"
myWs.somethingUpdated(item)
myWs.messageStart(agentId, messageId)
```

Adding a new event is one entry in the config — the derived `<Name>ServerEvent` union picks it up automatically. The central `ServerEvent` in `src/ws/events.ts` still composes per-domain unions manually (so domain ownership stays explicit).

`broadcast()` and `emit()` from `domains/ws/handler.js` remain available as escape hatches for forwarded / dynamic events (e.g. relaying arbitrary upstream Claude CLI events) and for cross-cutting code that genuinely has no domain home. Prefer the typed builder for anything that fits the config-map pattern.

## Logging

- Pino is preferred for anything where structured fields would help an operator (request handlers, server lifecycle hooks). Always include enough context to navigate from log to source.
- For tracing and ad-hoc diagnostics (runner stages, poller progress, migration steps), use `console.info`. For non-fatal failures and unexpected fallbacks, use `console.warn`. For real errors, use `console.error`.
- The lint rule (`no-console`) disallows bare `console.log`. The three allowed methods (`info`, `warn`, `error`) cover every case.
- Structured fields preferred over string interpolation when using Pino.

## Testing

Vitest. Tests collocated next to source (`foo.ts` and `foo.test.ts`). Run via `pnpm test` (whole workspace) or `pnpm --filter @minuthq/huxflux test` (server only). The `gate-test` agent picks targeted files automatically.

### The harness

`apps/server/test/harness.ts` exposes four helpers. Use them; do not roll your own.

- `createTestDb()` returns `{ db, close }`. Opens a fresh `:memory:` node:sqlite connection, runs every migration in order via the real `runMigrations()`, and swaps the resulting Drizzle instance in as the active `db` singleton (via `setDb`/`_resetDb` in `src/db/index.ts`). Every test calls `close()` in `afterEach` to free the connection and restore the production binding.
- `createGitTmpRepo()` returns `{ path, cleanup }`. A real git repo in a tmp dir with `user.email` and `user.name` set and an initial empty commit on `main`. Tests use this for anything that touches `src/domains/git/`.
- `silenceLogs()` returns `{ logs, errors, warnings, restore }`. Replaces `console.log` / `console.error` / `console.warn` with collecting buffers so production chatter (`[runner]`, `[meta]`, etc.) does not bleed into test output. Tests can read the captured strings to assert.
- `captureWsEvents(agentIds)` registers a fake `WebSocket` against the real `registerSocket` and subscribes it to the listed agent ids. Returns `{ events, restore }`. Every `agentsWs.*(...)` call accumulates here in order so tests can assert payload shape.

The `db` singleton in `src/db/index.ts` is wrapped in a Proxy that delegates to a mutable `_activeDb`. Tests get isolation via `setDb()` plus `_resetDb()`. Production code never reassigns.

### The fake-claude binary pattern

`apps/server/test/fixtures/fake-claude.mjs` is a no-dependency node script. It reads a JSON fixture path from `HUXFLUX_FAKE_FIXTURE`, then emits each `events[]` entry as a JSON line on stdout, writes `stderr[]` lines to stderr, and exits with `exitCode`. The runner tests spawn it via the real `spawnAndStream` and `runAgent` paths, so the test exercises the entire stream loop and finalize cycle without mocking any internal module.

To add a new fixture, drop a JSON file under `apps/server/test/fixtures/streams/` shaped like:

```json
{
  "exitCode": 0,
  "stderr": [],
  "events": [
    { "type": "system", "subtype": "init", "session_id": "..." },
    { "type": "assistant", "message": { "content": [{ "type": "text", "text": "..." }] } }
  ]
}
```

To inject a test provider into the runner, call `registerProvider(id, adapter)` from `domains/providers`. `_resetProviders()` restores the built-in map (run in `afterEach`). The adapter's `buildSpawnArgs` returns `{ bin: process.execPath, args: [FAKE_BIN], env: { HUXFLUX_FAKE_FIXTURE: fixturePath } }` so the runner spawns node against the fake binary.

### Rules

- Never mock an internal module. Use the real DB (via the harness), real git (via `createGitTmpRepo`), real spawn (via the fake binary).
- No snapshot assertions. Spell out the assertion.
- Test files have a 600-line cap (relaxed from the 400 production cap). Split by scenario when a single test file grows large.
- Tests can `console.log` while debugging fixtures (lint relaxed), but do not commit log spam.

