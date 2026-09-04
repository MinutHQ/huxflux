# agent-runner

The execution engine for a single agent turn. Spawns the provider CLI process, parses the stream output into normalized events, persists messages and tool calls, and finalizes the turn idempotently on exit. Domain-agnostic: every `<huxflux:*>` directive is dispatched to caller-supplied `TagHandler`s rather than handled inline. Peer of the `agents` domain rather than a sub-system of it.

## Owns

- The `runAgent` entrypoint (spawns the provider CLI, drives one turn end-to-end)
- The stream event state machine (`claudeStreamEvent` plus `normalizedEvent`)
- The generic huxflux tag parser + dispatcher (`tagParser.ts`)
- Per-turn lifecycle: `bootstrapTurn` (pre-spawn setup, user-message persist, pre-rename), `streamLoop` (spawn plus stdout/stderr parsing), `persistMessage` (final-content assembly, tag dispatch, DB writes, `message:done` emit), `finalize` (idempotent exit handler)
- The process registry (`runningProcesses` map, `stopAgent`, `isAgentRunning`, `resetStreamingFlags`)
- The Claude stdin control protocol (`service/controlProtocol.ts`): AskUserQuestion round trip (`can_use_tool` control_request → ask store + `ask:question` WS → `answerPendingQuestion` writes the allow control_response) and mid-run user-message injection (`injectUserMessage`)
- Turn segmentation (`service/turnSegments.ts`): a mid-run injection closes the current assistant message (persist + `message:done`) and opens a fresh skeleton below the injected message, so the chat reads work-so-far → injection → work-after. Segment state (pendingText, thinking, tool calls) resets per segment; `fullContent` and token usage stay turn-level so tag dispatch and usage accounting are unaffected
- Provider binary resolution and model-alias resolution (`getClaudeBin`, `resolveModelAlias`)
- The placeholder-name auto-rename fallback (`autoRename`)
- The (now domain-free) system-prompt scaffolding builder

## Public surface

(top-level `.ts` files in this domain)

- `agent-runner.service.ts` — exports `runAgent(userContent, opts)` (the turn entrypoint), the process-registry helpers `runningProcesses`, `getClaudeBin`, `isAgentRunning`, `stopAgent`, `resetStreamingFlags`, `resolveModelAlias`, and the control-protocol helpers `answerPendingQuestion(agentId, answers)` (completes a pending AskUserQuestion) and `injectUserMessage(agentId, text, sender?)` (delivers a user message into a running turn; returns false when the agent has no writable stdin so callers fall back to queueing).
- `agent-runner.types.ts` — `ParsedTag`, `TagHandler`, `TagOutcome`, `TagFollowUp`, and `RunAgentOptions`. The contract every caller of `runAgent` builds against. A `TagHandler.onTag` may return a `TagOutcome` whose `followUp` the runner delivers back to the agent as a fresh turn after finalize (used to report a side-effect that failed, e.g. a rejected PR reply).

Everything else lives under `service/` and is private to this domain. The end-to-end test (`agent-runner.service.test.ts`) sits next to the public entrypoint because it exercises the full bootstrap → spawn → stream → finalize lifecycle.

## Tags

Tags are how the model talks back to the server outside the chat stream:
`<huxflux:NAMESPACE.KIND attr1="val1" attr2="val2">body</huxflux:NAMESPACE.KIND>`
or `<huxflux:NAMESPACE.KIND attr="x"/>` for self-closing variants.

The runner itself has ZERO awareness of any specific tag id. Each call site of `runAgent` passes a `tags: TagHandler[]` array describing which directives it cares about and how to react. `tagParser.ts` extracts the structured tags, validates each handler's `attrs` against its Zod schema, calls `onTag({ args, body })`, and strips every `<huxflux:*>` tag from the persisted chat body. The matching tag-description prose (what the model sees in its system prompt) also comes from the caller via `opts.tagInstructions`.

The current tag inventory (owned by the consumer domains, not by this one):
- `agents.title` / `agents.branch` / `agents.delegate` / `agents.spawn` → see `domains/agents/runnerTags.ts`
- `tasks.comment` / `tasks.update` / `tasks.create` / `tasks.status` / `tasks.dependency` → see `domains/tasks/runnerTags.ts`
- `pr.reply` → see `domains/pull-requests/runnerTags.ts`
- `automations.trigger` / `automations.step` / `automations.remove` / `automations.config` → see `domains/automations/runnerTags.ts`

## Depends on

- `../agents/agents.ws.js` — `agentsWs` (every WS broadcast emitted while a turn runs)
- `../agents/agents.types.js` — `ClaudeStreamEvent`, `StreamState`, `RunnerOptions`, `CollectedToolCall`, `ClaudeContentBlock` (the runner-shared accumulator + the queue-shape options)
- `../agents/rename.js`, `../agents/title.js` — used by `autoRename` for the placeholder-name fallback (agent-domain helpers, intentionally allowed)
- `../providers/registry.js`, `../providers/providers.types.js`, `../providers/context.js` — provider lookup + adapter types
- `../git/worktrees.js` — `getFileChanges`
- `../../db/index.js`, `../../db/schema.js` — Drizzle handle + tables (`agents`, `messages`, `toolCalls`, `terminalLines`, `fileChanges`, `repos`)
- `../../config.js`, `../../sandbox.js`, `../../types.js`, `../../askStore.js` — config, sandbox, cross-cutting types, AskUserQuestion store
- `simple-git`, `uuid`, `drizzle-orm`, `zod/v4` — runtime
- `node:child_process`, `node:fs`, `node:path`, `node:os` — system

**Notably absent**: the runner does NOT import from `../automations`, `../tasks`, or `../pull-requests`. Every behaviour those domains used to inject inline now flows through caller-supplied `TagHandler` entries.

## Sub-domains

None.

## Quirks

- `agent-runner.service.test.ts` is the end-to-end test that spawns the fake-claude binary. It validates the entire bootstrap, spawn, stream, finalize lifecycle against deterministic JSON fixtures.
- The `processRegistry` module owns a process-level Map of `agentId` to `ChildProcess`. This is in-memory state that cannot survive a server restart; `resetStreamingFlags()` is called at boot to clear the `streaming=1` rows that a previous (now-dead) process owned.
- `runAgent` is the single behavioural public entry. The other exports (`runningProcesses`, `getClaudeBin`, `isAgentRunning`, `stopAgent`, `resetStreamingFlags`, `resolveModelAlias`) are narrow observability + cleanup helpers.
- Tags are dispatched at message-end inside `persistMessage`, not mid-stream. The previous mid-stream meta-directive dispatch (title/branch/delegate fired immediately) has been replaced by a single dispatch on finalize. The user-visible effect is the same — title/branch updates land in the same turn — they just land at message end instead of partway through.
- Tags are also stripped from each tool call's `precedingText` so they never leak into the visible UI.
- Pre-spawn auto-rename (`service/bootstrapTurn.ts`) is bounded by a 15-second `Promise.race` so a stuck Haiku call cannot block the run forever.
- Claude turns run with `--input-format stream-json` and `--permission-prompt-tool stdio`: the prompt is written to the child's stdin (`SpawnResult.stdinInit`), the pipe stays open for control responses and injected messages, and the runner closes stdin when the `result` event arrives so the CLI exits. AskUserQuestion only exists in print mode when the stdio permission prompt tool is active (Claude Code ≥ 2.x).
- The runner spawns processes via `node:child_process` (not `node-pty`). PTY handling lives in `src/domains/ws/pty.ts` and is unrelated. Signal handling sends `SIGTERM` to the process group first, falls back to `proc.kill`, and force-`SIGKILL`s after 3 seconds.
- The `onAssistantMessage` hook on `RunAgentOptions` is the escape hatch for non-tag side effects that need access to the final message (currently used by the chat path to mirror a working-agent's reply into its linked task's comment thread).
