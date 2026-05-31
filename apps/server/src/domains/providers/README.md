# providers

CLI provider abstractions: Claude (streaming + interactive), Codex (OpenAI), Gemini (Google). Each provider exposes a normalized streaming interface that the agents runner consumes. Provider availability detection (which CLIs are installed) lives in `domains/settings` — only the provider runtimes themselves live here.

## Owns

- The provider registry (`getProvider` / `getAvailableProviders` / `getInstalledProviders`) and the four provider adapters: `claudeProvider`, `claudeInteractiveProvider`, `codexProvider`, `geminiProvider`.
- The `ProviderAdapter` interface: `resolveBinary`, `isAvailable`, `buildSpawnArgs`, `parseStreamLine`, `resolveModel`, `getModels`, optional `installHooks`.
- The `NormalizedStreamEvent` union: every provider parses its raw stdout into this provider-agnostic shape so the agents runner has a single event-handling path.
- `SpawnOptions` / `SpawnResult` / `ProviderCapabilities` / `ProviderId` — the data shapes the runner uses to drive provider spawns.
- `buildConversationContext` — formats the last N persisted messages into a prompt prefix for providers that don't support session resume (currently Codex).
- The `createBinaryResolver` factory in `service/binary.ts` (internal, not exported). Every adapter constructs one to get `{ resolve, isAvailable, reset }` so binary discovery, the cached path, and the availability probe live in one place.
- Per-provider model alias maps (claude / claude-interactive / gemini) and the `MODELS` table each adapter returns from `getModels()`. Shape is uniform across providers: `{ id, label, api }`.
- The `claude` provider's `installHooks` implementation: writes `~/.claude/hooks/huxflux-ask-user.sh` and registers it as a PreToolUse hook in `~/.claude/settings.json` so the AskUserQuestion CLI tool routes back to the Hive UI.

## Public surface

Top-level `.ts` files in this domain are public; the `service/` subfolder houses each provider adapter and is private.

- `registry.ts` — provider registry: `getProvider`, `getAvailableProviders`, `getInstalledProviders`, `registerProvider` (test seam), `_resetProviders` (test-only). Re-exports `ProviderId` and `ProviderAdapter` from `providers.types.ts`.
- `providers.types.ts` — `ProviderId`, `ProviderAdapter`, `NormalizedStreamEvent`, `SpawnOptions`, `SpawnResult`, `ProviderCapabilities`.
- `context.ts` — `buildConversationContext` (formats the last N persisted messages into a prompt prefix for providers that don't support session resume).

## Depends on

- `src/db/index.ts` and `src/db/schema.ts` — `buildConversationContext` reads the `messages` table to build the context prefix for providers without session resume
- `node:child_process` — `execFileSync` for binary discovery (`which <bin>`) and the `npx claude-p --help` availability probe; the actual streaming spawn lives in the agents runner
- `node:fs/promises` — Claude's `installHooks` writes the hook script and edits `~/.claude/settings.json`
- `drizzle-orm` — the `eq` query helper used by `buildConversationContext`

## Sub-domains

None.

## Quirks

- **No Fastify plugin.** This domain has no HTTP endpoints of its own and therefore is not registered in `src/domains/index.ts`. The `/api/providers` listing endpoint that surfaces this domain to the client lives in `domains/agents/routes/agents.misc.routes.ts` because it's a property of the agent-creation flow, not of the providers themselves.
- **No WebSocket events.** Providers don't emit WS events directly. The runner (in `domains/agent-runner/`) drains the normalized event stream and turns it into agents-domain WS events via `agentsWs`.
- **Per-provider binary discovery via `createBinaryResolver`.** Each adapter calls the factory with `{ defaultBin, envVar, fallbackBin?, extraAvailabilityCheck? }` and exposes the returned `resolve` / `isAvailable` as the adapter's `resolveBinary` / `isAvailable`. The resolution order is: env var override (`CLAUDE_BIN` / `CODEX_BIN` / `GEMINI_BIN` / `CLAUDE_P_BIN`), then `which <defaultBin>`, then `fallbackBin` (defaults to `defaultBin`). The claude-interactive adapter uses `fallbackBin: "npx"` plus an `extraAvailabilityCheck` that probes `npx claude-p --help` (10s timeout) when `which claude-p` fails. The cached path lives inside the closure, not in module scope, and a per-adapter `reset()` exists as a test seam (currently unused; tests inject a fake provider via `registerProvider` instead of resetting caches).
- **claude-interactive uses `npx` not node-pty.** The previous CLAUDE.md note about node-pty is out of date: `claude-p` itself owns the PTY internally; from this domain's point of view it's just another `spawn()`-able binary (or `npx claude-p` when the global install isn't found). All four providers are driven via `spawn()` from the agents runner.
- **Codex has no session resume.** `codexProvider.capabilities.sessionResume === false`, so the agents runner calls `buildConversationContext(agentId)` and passes the result through `SpawnOptions.conversationContext`. The codex adapter prepends it to the user prompt because Codex's `exec` subcommand has no per-message history flag.
- **Gemini has no `--append-system-prompt`.** The gemini adapter wraps the system prompt in `<system_instructions>` / `<user_message>` XML tags and concatenates them into a single prompt string so the model can still distinguish the two.
- **Claude's `installHooks` writes to the user's global `~/.claude` directory.** It is idempotent — the PreToolUse entry is skipped if a matching `huxflux-ask-user` hook is already installed. Failures are caught and logged because hook installation is non-fatal for the run.
- **Parsers tolerate malformed lines.** Every `parseStreamLine` swallows `JSON.parse` errors and returns `null`; the runner skips null events. Sub-agent forwarding (Claude, claude-interactive) is keyed on the presence of `parent_tool_use_id` so unknown event shapes still surface as `subagent` events with the raw payload, keeping the upstream Claude CLI event format observable to the UI without a per-event allowlist.

## Adding a new provider

1. Create `service/<name>.ts` and export a `const <name>Provider: ProviderAdapter`.
2. Construct binary discovery with `createBinaryResolver({ defaultBin, envVar, fallbackBin?, extraAvailabilityCheck? })` and wire `resolveBinary: binary.resolve` and `isAvailable: binary.isAvailable` onto the adapter.
3. Implement `parseStreamLine` to map the CLI's stdout JSONL shape into `NormalizedStreamEvent`s (return `null` for lines you do not care about; the runner skips them).
4. Implement `buildSpawnArgs` to return `{ bin, args, env? }` based on `SpawnOptions` (handle `planMode`, `sessionId`, `isContinuation`, `allowedTools`, `effort`, and `conversationContext` if your provider has no session resume).
5. Add a `MODELS` table of `{ id, label, api }` plus a `resolveModel` that handles display-name aliases, and add the new id to the `ProviderId` union in `providers.types.ts`. Register the adapter in `registry.ts` under its id.

## Writing parseStreamLine

Every provider implements `parseStreamLine(line: string): NormalizedStreamEvent | null`. The function:

- Returns a `NormalizedStreamEvent` when the line is a recognised provider event.
- Returns `null` when the line is malformed JSON, an unknown event type, or doesn't carry semantic content (e.g. heartbeat).
- Never throws. Catch every parse failure and return null.
- Has no side effects. Pure JSON-in / typed-event-out.

### Mapping table

| Concept | Claude raw | Codex raw | Gemini raw | NormalizedStreamEvent |
|---|---|---|---|---|
| Text chunk | `{ type: "assistant", message: { content: [{ type: "text", text }] } }` | `{ type: "item.completed", item: { type: "agent_message", text } }` | `{ type: "message", role: "assistant", content }` | `{ type: "text", text }` |
| Thinking | `{ type: "assistant", message: { content: [{ type: "thinking", thinking }] } }` | (not supported) | `{ type: "thinking", content }` | `{ type: "thinking", text }` |
| Tool use | `{ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } }` | `{ type: "item.completed", item: { type: "command_execution" \| "file_edit", id, ... } }` | `{ type: "tool_use", tool_id, tool_name \| name, parameters \| input }` | `{ type: "tool_use", id, name, input }` |
| Tool result | `{ type: "tool_result", tool_use_id, content }` | (folded into command_execution above) | `{ type: "tool_result", tool_id, output }` | `{ type: "tool_result", toolUseId, content }` |
| Session start | `{ type: "system", subtype: "init", session_id }` | (not supported, Codex has no resume) | `{ type: "init", session_id }` | `{ type: "session_init", sessionId }` |
| Usage | `{ type: "result", usage: { input_tokens, output_tokens, ... } }` | `{ type: "turn.completed", usage: { input_tokens, output_tokens, cached_input_tokens } }` | `{ type: "result", status: "success", stats: { input_tokens, output_tokens } }` | `{ type: "usage", inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens? }` |
| Error | `{ type: "error", message }` | `{ type: "error", message }` or `{ type: "turn.failed", error: { message } }` | `{ type: "error", message }` or `{ type: "result", status: "error", error: { message } }` | `{ type: "error", message }` |
| Sub-agent | (any event carrying `parent_tool_use_id`) | (not supported) | (not supported) | `{ type: "subagent", toolUseId, event }` |

`NormalizedStreamEvent` also carries a `done` variant. None of the existing providers emit it from `parseStreamLine`; the agents runner derives "done" from process exit and the optional final `result` event. New parsers should follow suit and not invent a synthetic done.

### Tolerance rules

1. Malformed JSON, return null. Always wrap `JSON.parse` in a `try`/`catch`.
2. Known JSON, unknown discriminator, return null (forward-compat with CLI updates).
3. Missing optional fields, use `undefined`, do not throw. The Normalized union has optional fields for exactly this reason.
4. No side effects: never call the DB, never broadcast WS events, never log at warn/error level. `console.info` is OK for one-off debug while authoring; remove it before commit.
5. Sub-agent forwarding (Claude family) keys on `parent_tool_use_id`. Unknown event shapes that carry that field still surface as `subagent` events with the raw payload, so the UI keeps visibility into upstream changes without a per-event allowlist.

### Testing

Every provider must have a `<provider>.test.ts` next to its source exercising at minimum: each variant in the mapping table the provider supports, plus malformed JSON, plus an unknown event type. Use inline `JSON.stringify(...)` fixtures, no fixtures folder. See `claude.test.ts`, `claudeInteractive.test.ts`, `codex.test.ts`, and `gemini.test.ts` for the established shape.
