# server-icon (shared)

## Owns

- Schemas and the HTTP slice for generating a server's switcher icon with the Codex CLI on that server.

## Public surface

- `server-icon.types.ts`: `serverIconCapabilitiesSchema`, `generateServerIconBodySchema`, `generateServerIconResponseSchema` and their types.
- `server-icon.api.ts`: `serverIconApi` (`capabilities`, `generate`), composed into `api.serverIcon`. Targets the active server.
- `server-icon.hooks.ts`: `useIconGeneratorServers(servers)` probes every configured server and returns those with Codex; `generateServerIconOn(server, body)` generates on a specific server. Used so any server's Codex can draw icons, whichever is active.

## Depends on

- `../../apiBase.js` for `reqValidated`.
- `../servers/servers.store.js` for per-server auth headers.

## Sub-domains

None.

## Quirks

- The chosen icon itself is stored client-side on the server entry (`iconImage` in the servers domain), not on the server.
