# settings

Cross-platform API slice for the server-side settings blob, the feature-flag / provider discovery endpoints, and the in-app feedback channel. Owns the canonical schema (type + defaults + metadata) for every server-side setting. Mirrors the server-side `settings` domain.

## Owns

- The `settingsApi` HTTP slice: GET / PATCH the `/api/settings` blob, GET `/api/config` (feature flags surfaced through `useServerConfig` in the servers domain), GET `/api/providers` (provider + model discovery), POST `/api/feedback` (in-app feedback dialog)
- The `settingsSchema` source of truth for every server-side setting: shape, runtime defaults, and forward-compatible UI metadata (label / description / section)
- The `HuxfluxSettings` type, derived from `settingsSchema`
- The `ProviderInfo` type (a local copy kept private to the api slice so the http return type is well-typed on the client)

## Public surface

- `settingsApi` — settings HTTP slice, merged into the composed `api` object at the package root
- `settingsSchema` — canonical schema for every server-side setting (type, default, label, description, section)
- `settingsDefaults` — typed `{ [key]: default }` map derived from the schema; the server spreads this under the on-disk JSON so every reader sees a fully-populated object
- `HuxfluxSettings` — shape of the settings blob, derived from `settingsSchema`
- `SettingDef` — discriminated union describing one setting (boolean / string / longtext / number / select / custom)
- `SettingsSection` — string union of every settings tab a `SettingDef` may live in
- `huxfluxSettingsSchema` — Zod schema for the settings blob (derived from `settingsSchema`); used by `settingsApi` and the server's settings route to validate input
- `partialHuxfluxSettingsSchema` — alias of `huxfluxSettingsSchema` (every field is already optional); kept as a documented entry-point for PATCH bodies
- `providerInfoSchema` — Zod schema for one entry returned by `GET /api/providers`
- `serverConfigSchema` — Zod schema for `GET /api/config`
- `serverVersionInfoSchema` — Zod schema for `GET /api/system/version` and `POST /api/system/version/check`
- `updateResultSchema` — Zod schema for `POST /api/system/update`
- `feedbackRequestSchema` — Zod schema for the body of `POST /api/feedback`
- `feedbackResponseSchema` — Zod schema for the response of `POST /api/feedback`
- `ProviderInfo` — provider entry returned by `GET /api/providers`
- `ServerConfig` — shape of `GET /api/config`
- `ServerVersionInfo` — shape of the server-version endpoints
- `UpdateResult` — shape of `POST /api/system/update`
- `FeedbackRequest` — body shape of `POST /api/feedback`
- `FeedbackResponse` — response shape of `POST /api/feedback`

## Depends on

- `../../apiBase` — `req` for the api slice

## Sub-domains

None.

## Quirks

- `settingsSchema` is the single source of truth for the settings blob: the `HuxfluxSettings` type, `settingsDefaults`, and the UI metadata all derive from one object literal. Adding a new setting means adding one entry there; no other file needs to change.
- The `label` / `description` / `section` metadata is **forward-compatible**: a future generic settings-UI renderer will consume it. Today the hand-written sections under `apps/web/src/domains/settings/sections/*` still render themselves and remain the authoritative client UI. Updating the schema's metadata does NOT change what the current UI displays.
- `ProviderInfo` is intentionally private to this domain (not exported from `index.ts`). Consumers don't need to import the type directly — they work through `settingsApi`.
- `getServerConfig` and `getProviders` live here even though they're consumed by the servers / chat / settings UI surfaces. They are server-level configuration endpoints, not agent or repo endpoints, so settings is their natural home.
- `submitFeedback` lives here because the in-app feedback dialog ships with the settings / about surface. The endpoint creates a GitHub issue server-side but the client surface is settings-shaped.
- No hooks live in this domain. `useServerConfig` (which calls `settingsApi.getServerConfig` via the composed `api` object) lives in the servers domain because it's about a specific server, not the settings blob.
