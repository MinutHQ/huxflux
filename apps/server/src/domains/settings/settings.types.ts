// `HuxfluxSettings` is derived from the schema in `@huxflux/shared` — the
// single source of truth for the settings blob (shape + defaults + metadata).
// Re-exported here so existing server-side imports of `./types.js` keep
// working, and so future server-only setting metadata could be added here
// without forcing every consumer through the shared barrel.

export type { HuxfluxSettings } from "@huxflux/shared/settings-schema"
