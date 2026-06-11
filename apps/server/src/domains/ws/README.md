# ws

WebSocket transport for the server: connection lifecycle, subscription routing, the typed event-builder factory, the composed `ServerEvent` union, and the long-lived PTY socket for the terminal viewer.

## Owns

- `handler.ts` — connection registration, per-agent subscription map, `broadcast()` / `emit()` primitives, and the `onAgentSubscription` lifecycle hook (first-subscriber / last-unsubscribe). Parses client frames against `clientEventSchema` and drops malformed envelopes.
- `define.ts` — `defineEvents` factory plus the `EventsConfig` / `EventsApi` / `InferEvents` type machinery that lets each domain declare its event surface as a config map.
- `events.ts` — the composed `ServerEvent` discriminated union; built from each domain's `<Name>ServerEvent` plus the cross-cutting `error` event.
- `pty.ts` — the `/ws/pty/:agentId` long-lived PTY socket: spawn, output replay on reconnect, kill / reconnect / resize handlers, and per-agent terminal lifecycle helpers.

## Public surface

Top-level `.ts` files in this domain are public; subfolders (none today) are private.

- `define.ts` — `defineEvents`, `EventConfig`, `EventsConfig`, `EventsApi`, `InferEvents`.
- `handler.ts` — `registerSocket`, `broadcast`, `emit`, `onAgentSubscription`.
- `events.ts` — `ServerEvent` (composed union), `ClientEvent` (re-export).
- `pty.ts` — `registerPtySocket`, `killTerminal`, `killAgentTerminals`, `hasActivePty`.

## Depends on

- `@huxflux/shared` — `clientEventSchema` (envelope validation).
- `@fastify/websocket` — the underlying `WebSocket` type.
- `../agents/ws.js`, `../automations/ws.js`, `../tasks/ws.js` — domain event unions composed into `ServerEvent`.
- `../../db/index.js`, `../../db/schema.js` — agent + repo lookups in the PTY spawn path.
- `@homebridge/node-pty-prebuilt-multiarch` — PTY spawn.

## Sub-domains

None.

## Quirks

- `handler.ts` keeps two state maps: `subscriptions` (per-agent `Set<WebSocket>`) and `allSockets` (every connection). The `emit` path uses the first; `broadcast` uses the second. Close-handler cleanup walks both.
- `onAgentSubscription` listeners fire only on the empty→first and last→empty transitions of an agent's subscriber set, so consumers (e.g. the git file watcher) attach/detach per-agent work tied to whether a client has the agent open. The transport stays dependency-free; the actual watch/unwatch wiring lives in `index.ts`.
- `pty.ts` keeps a module-level `globalPtyMap` keyed by `${agentId}:${terminalId}` so PTY processes survive client reconnects. The output buffer is a rolling 100KB tail, replayed on fresh xterm connects.
- The pnpm spawn-helper chmod at the top of `pty.ts` runs once at import time. It works around pnpm stripping execute bits from the prebuilt `spawn-helper` binary.
- `events.ts` composes the `ServerEvent` union by hand from per-domain `<Name>ServerEvent` types. New domain events are inferred from that domain's `defineEvents` config; adding a new domain event union here is a deliberate one-liner that keeps domain ownership explicit.
