# servers

Cross-platform registry of huxflux server instances. Persists the list of known servers (URL + auth token) in the platform's storage adapter, tracks which one is active, parses huxflux:// connection strings, and exposes reachability polling for the UI.

## Owns

- The on-disk (web localStorage / RN MMKV via the storage adapter) `huxflux:servers` list and `huxflux:active-server` pointer
- The `HuxfluxServer` shape: id, name, url, token, addedAt
- The `huxflux://` and `http(s)://` connection-string parser used by the onboarding / add-server flow
- The `useServerStatus` hook that polls `/health` + `/api/config` per server every 20s and exposes `online | offline | checking | unauthorized` per id
- The `useServerConfig` hook that fetches `/api/config` for the currently active server and exposes the feature flags (githubEnabled, feedbackEnabled)
- The `huxflux:servers-changed` window event dispatched on every list / active-id mutation (consumed by the server switcher)

## Public surface

- `getServers` — returns the persisted server list (empty array if storage is missing)
- `addServer` — appends a new server, deduplicating by normalized URL; updates the existing entry's token if it changed
- `updateServer` — patches name / url / token on an existing entry by id
- `removeServer` — drops an entry; if it was active, promotes the next server or clears the active pointer
- `getActiveServerId` — current active server id (null if none)
- `setActiveServerId` — switches the active server and broadcasts the change
- `getActiveServer` — returns the active server, or the first server, or null
- `parseConnectionString` — parses a `huxflux://` or `http(s)://` URL into `{ url, token }` (returns null on failure)
- `useServerStatus` — polls reachability for a list of servers (every 20s, 5s timeout per probe)
- `useServerConfig` — TanStack Query wrapper around `/api/config` returning `{ githubEnabled, feedbackEnabled }`
- `huxfluxServerSchema` — Zod schema for the server registry entry; `HuxfluxServer` is its inferred type
- `serverStatusSchema` — Zod enum schema for the reachability state union; `ServerStatus` is its inferred type
- `HuxfluxServer` — server registry entry shape
- `ServerStatus` — reachability state union

## Depends on

- `../../storage` — `getStorage` adapter (web localStorage / RN MMKV)
- `../../api` — the composed `api` object (for `useServerConfig`'s `/api/config` call)
- `react`, `@tanstack/react-query` — hook runtime

## Sub-domains

None.

## Quirks

- `parseConnectionString` swaps the `huxflux://` scheme for `http://` before handing the string to the URL constructor — `huxflux://` is an unknown scheme to the parser. The original scheme is not preserved; callers should not assume the returned URL begins with `huxflux://`.
- `addServer` returns the existing duplicate when a server with the same URL already exists. If the caller supplied a different token, the existing entry is updated in place and the new token is reflected in the returned object.
- `useServerStatus` re-runs only when the list of server ids changes (joined string compared). The effect carries `// eslint-disable-next-line react-hooks/exhaustive-deps` so the array-identity change of `servers` itself doesn't restart the poller every render.
- The fetch in `checkStatus` uses a 5-second AbortController timeout per probe; the polling cadence is 20s. A network blip will mark a server `offline` for up to 20s before the next probe reclassifies it.
- The hooks live here even though `useServerConfig` calls `api.getServerConfig()` (which is composed from the settings domain's api slice). The composed `api` object is the boundary, so this is not a cross-domain hard dependency — the hook treats `api` as opaque.
