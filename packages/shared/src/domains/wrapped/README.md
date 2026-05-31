# wrapped

Cross-platform type and API slice for the AI-generated "Wrapped" recap of recent coding activity. Mirrors the server-side `wrapped` domain.

## Owns

- The `WrappedSummary` shape returned by `/api/wrapped`
- The `wrappedApi` HTTP slice: `current(period, from, to, refresh, length)` with a 60-second timeout for the Claude round-trip

## Public surface

- `wrappedApi` — wrapped HTTP slice, merged into the composed `api` object at the package root
- `wrappedSummarySchema` — Zod schema for `/api/wrapped`
- `WrappedSummary` — `{ summary, periodKey, cached }` shape returned by `/api/wrapped`

## Depends on

- `../../apiBase` — `req` for the api slice

## Sub-domains

None.

## Quirks

- `wrappedApi.current` accepts an optional `length` (`short` / `medium` / `long`) which is appended to the cache key on the server side. Each length variant is cached independently.
- The 60-second timeout is needed because Claude Haiku summary generation can take 20–30 seconds; the default 15s `req` timeout would prematurely abort.
- The home dashboard's `useWrappedSummary` hook lives in the agents domain on the web app side (the wrapped panel is part of `HomeView`). The shared package only owns the api slice and the type; the React hook is a web-only consumer.
