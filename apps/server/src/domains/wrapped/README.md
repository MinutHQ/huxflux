# wrapped

The narrative "wrapped" recap of recent coding activity: pick a time window (week-to-date, last week / month / year, or a custom from-to pair), choose a length (short / medium / long), and the server gathers stats and asks Claude Haiku to write a paragraphs-long summary of what shipped, what's in progress, and which files moved the most.

## Owns

- The `/api/wrapped` REST surface: GET with `period`, `from`, `to`, `refresh`, and `length` query params
- The cache layer over `wrapped_summaries`: writes go through `onConflictDoUpdate` so rapid regenerate clicks don't race on insert
- The date-range / cache-key derivation for every supported period (week-to-date, last week, last month, last year, custom from-to)
- The DB stat-gathering aggregates (agent counts by status, message + token totals, tool calls, file churn, shipped + in-progress agent lists, top touched files, average completion time, active repos)
- The prompt template handed to Claude (period header, repo list, shipped / in-progress / top-files sections, length-specific instructions)
- The Claude-CLI runner that turns the prompt into a narrative chunk (timeout, error mapping, claude bin discovery)

## Public surface

- `wrapped.routes.ts` — exposes `wrappedPlugin`, the Fastify plugin registering GET `/api/wrapped`. Wired through the registry at `src/domains/index.ts`.

## Depends on

- `src/db/index.ts` — Drizzle handle (the `wrapped_summaries` Drizzle table now lives in this domain's own `wrapped.db.ts`; cross-domain `agents`, `messages`, `tool_calls`, `file_changes`, `repos` tables are imported via the schema barrel)
- `drizzle-orm`, `fastify` — runtime
- `node:child_process` (`execFileSync` for `which claude`, `spawn` for the print-mode call), `node:crypto` (`randomUUID` for the cached row id) — system

## Sub-domains

None.

## Quirks

- Cache key includes the length variant: `${baseKey}-${length}`. Each length is cached independently so flipping short ↔ long doesn't overwrite the other.
- Empty periods (no agents, no messages) short-circuit before calling Claude. The "No agent activity in this period." string still gets cached so the next hit is fast.
- `generateSummary` calls the Claude CLI with `--print --output-format text --max-turns 1` and a 30-second timeout. The `claude-haiku-4-5` model is hard-coded; if you want to swap, edit `service/summary.ts`.
- `getClaudeBin` mirrors the agent-domain runner's resolution: env var > `which claude` > the literal string "claude". A separate copy is kept inside this domain to avoid a cross-domain import for a 4-line helper.
- DB queries live inside `service/stats.ts` rather than a separate query-helpers module. The Drizzle table definition for this domain (`wrapped_summaries`) is co-located in `wrapped.db.ts`.
- `gatherStats` returns a `GatheredStats` object so the prompt builder and the route handler share the same view of the data without redoing the work.
- The 407-line legacy `routes/wrapped.ts` was split into five service files (`dateRange.ts`, `formatting.ts`, `stats.ts`, `prompt.ts`, `summary.ts`) plus a thin `generate.ts` orchestrator. Every function is under the 80-line cap.
