# headroom

Integration with the Headroom context-compression proxy (headroomlabs.ai). Owns the sidecar lifecycle and the per-agent env that routes a Claude Code process through it. The per-agent toggle itself is an `agents` column; this domain only reacts to it.

## Owns

- Discovery of the `headroom` CLI (`HEADROOM_BIN` override, then `which headroom`), via the providers domain's `createBinaryResolver`.
- The managed sidecar: `headroom proxy --host 127.0.0.1 --port <port> --telemetry`, started on demand by the runner, health-checked on `/health`, killed on server shutdown.
- Reuse of an already-running proxy on the configured port (never killed by us).
- The env vars injected into a Claude Code spawn when the agent has Headroom on: `ANTHROPIC_BASE_URL`, `ENABLE_TOOL_SEARCH`, and an `X-Headroom-Project: <agentId>` line in `ANTHROPIC_CUSTOM_HEADERS`.
- Mapping the proxy's `/stats` payload into the shared `HeadroomAgentStats` shape.
- `GET /api/headroom/status`, `GET /api/headroom/agents/:agentId/stats`, and `POST /api/headroom/install` (unattended CLI install through `uv tool install` or `pipx install`, whichever is on PATH; progress in the status payload).

## Public surface

- `headroom.routes.ts` — `headroomPlugin`, registered in the domain registry.
- `headroom.service.ts` — `ensureHeadroomProxy()` (returns the base URL, spawning if needed), `buildHeadroomEnv(agentId, baseUrl)` (pure), `getHeadroomStatus()`, `getHeadroomAgentStats(agentId)`, `installHeadroom()`, `stopHeadroomProxy()`, `warmHeadroomAvailability()`, `mapHeadroomAgentStats(raw, agentId)` (pure, for tests), and the test seams `_setHeadroomSpawnOverride` / `_resetHeadroom`.

## Depends on

- `../providers/binary.js` — `createBinaryResolver`.
- `../../logger.js`.
- `@huxflux/shared` — response schemas.
- `node:child_process` (async `spawn` only) and the global `fetch`.

## Sub-domains

None.

## Quirks

- **Claude only.** The runner injects the env only when the provider id is `claude`. Codex and the others run direct.
- **The proxy's frozen-prefix state lives in the headroom process.** Restarting the proxy, or flipping the agent toggle mid-conversation in either direction, changes the message prefix Anthropic sees and costs one full prompt-cache rewrite on the next turn. Turning it on for a fresh agent is free.
- **`ENABLE_TOOL_SEARCH=true` is not optional.** With a custom `ANTHROPIC_BASE_URL` and that var unset, Claude Code disables deferred tool loading and the context grows by tens of thousands of tokens, wiping out the compression gain (headroom issue #746).
- **Port handling.** `HEADROOM_PORT` (default 8787). If something already answers `/health` there we reuse it as an external proxy. If the spawn exits early (port taken by something else) we try the next port, up to 5. A health timeout is not retried on another port because a slow first start (ML weights download) looks identical.
- **Stats need `--telemetry`.** It is local-only in current headroom (the remote beacon was removed); without it `/stats` stays empty. Per-agent rows come from `savings.per_project[<agentId>]`, capped at 50 projects with smallest/oldest eviction. Cache figures (`prefix_cache.compression_vs_cache`) are proxy-wide.
- **Install is one-at-a-time and in-memory.** A second POST while one runs returns the running state. Progress is a 40-line log tail; a server restart forgets it (the install itself keeps going or has finished). Only `uv` and `pipx` are tried, in that order.
- **Failure is non-fatal.** If the proxy cannot start, the runner emits an error line into the chat and runs the turn without compression rather than failing the turn.
