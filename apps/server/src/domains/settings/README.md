# settings

The persistent user-settings blob for the server: review prompt / model defaults, provider defaults, kill-on-done toggle, PR / CI monitoring toggles, polling interval, threads experiment flag, and Jira credentials. Stored as a single JSON file in the huxflux data dir.

## Owns

- The `/api/settings` REST surface: GET returns the merged blob (defaults backfilled if a key is missing on disk), PATCH shallow-merges the body into the existing blob and writes it back
- The on-disk `settings.json` file under the huxflux data dir (created lazily on first save)
- Re-exports the `HuxfluxSettings` type from `@huxflux/shared/settings-schema` — the canonical schema for type, defaults, and metadata lives in shared so web, server, and mobile agree on the shape

## Public surface

- `settings.routes.ts` — exposes `settingsPlugin`, the Fastify plugin registering GET/PATCH `/api/settings`. Wired through the registry at `src/domains/index.ts`.
- `settings.service.ts` — `getSettings` (synchronous reader that spreads `settingsDefaults` under the on-disk JSON) and `saveSettings` (synchronous writer; creates the data dir if needed and overwrites the file with pretty-printed JSON).
- `settings.types.ts` — re-exports `HuxfluxSettings` from `@huxflux/shared/settings-schema`. Every field is optional; the runtime guarantee comes from the merge in `getSettings`.

## Depends on

- `@huxflux/shared/settings-schema` — `settingsDefaults` (and the `HuxfluxSettings` type)
- `src/config.ts` — `DATA_DIR` for the on-disk location
- `node:fs`, `node:path` — file I/O

## Sub-domains

None.

## Quirks

- The file is read on every `getSettings()` call (no in-memory cache). Settings change rarely enough that a JSON parse per read is fine; callers that read in tight loops (the poller) get the latest values for free.
- `saveSettings` is destructive — it replaces the whole file. The route handler shallow-merges the PATCH body onto the existing settings before calling it, so partial updates don't drop unrelated keys. Callers that import `saveSettings` directly must merge themselves.
- `getSettings()` always returns a fully-populated object (defaults spread under the on-disk JSON), so consumers do NOT need to write `s.field ?? someFallback` for any field that has a schema default. The type stays all-optional because the on-disk shape is partial — the runtime guarantee comes from the merge in `getSettings`.
- The schema (type + defaults + UI metadata) is centralised in `@huxflux/shared/settings-schema`. Adding a new server setting means adding an entry there; this domain only needs to know `settingsDefaults` exists.
