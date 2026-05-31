# packages/shared — Agent Rules

Cross-platform types, hooks, API client, WebSocket logic. Used by web, mobile, desktop.

Read the root CLAUDE.md first.

## Layout

```
src/
  domains/<name>/    Per-domain shared code. Mirrors app-side domain names.
                     Seven domains: agents, settings, repos, pull-requests,
                     tasks, servers, wrapped.
  index.ts           Top-level barrel — the public surface of the package.
                     Re-exports every domain so consumers import from
                     `@huxflux/shared`, never from internal paths.
  api.ts             Composes every domain's api slice into the unified
                     `api` object. Each domain owns `domains/<name>/<name>.api.ts`.
  apiBase.ts         Shared HTTP helpers (`req`, `getApiBase`, `authHeaders`).
                     Every domain's api slice imports from here.
  ws.ts              WebSocket transport + the composed `ServerEvent` union
                     (built from each domain's `<Name>ServerEvent`). Stays
                     top-level because it's transport, not a feature.
  diff.ts            Pure diff parser + tokenizer (cross-cutting, used by
                     chat, file-changes, pull-requests).
  storage.ts         Storage adapter abstraction (web localStorage vs RN
                     AsyncStorage / MMKV).
```

## Structure

Domain-ized. New cross-platform types/hooks/api helpers go directly into the matching `domains/<name>/` (mirror the app-side domain name).

## Domain shape (shared package)

```
domains/<name>/
  README.md         5 sections: Owns, Public surface, Depends on, Sub-domains, Quirks.
  <name>.types.ts   Cross-platform types for this domain.
  <name>.api.ts     HTTP slice for this domain's endpoints. Exports
                    `<name>Api` which `src/api.ts` spreads into the composed
                    `api` object. Imports HTTP helpers from `../../apiBase`.
  <name>.hooks.ts   React/RN hooks (only if the hook works on both platforms).
                    Substantive hook bundles can live in `hooks/<name>.ts`.
  <name>.state.ts   Pure derivations (e.g. `isAgentStreaming`).
  <name>.store.ts   Stateful module-level helpers (e.g. the servers registry).
  <name>.schema.ts  Settings-style schema (only the `settings` domain uses this).
```

Per-domain `index.ts` barrels do not exist. The top-level `src/index.ts` IS the package barrel (the one barrel that survives the per-domain-barrel removal); it re-exports symbols directly from each domain's sub-files. The README's "Public surface" section is human-maintained — there is no script enforcing sync with the top-level barrel.

## Composed `api` object

`src/api.ts` is one line of imports and one object spread:

```ts
import { agentsApi } from "./domains/agents/agents.api"
import { settingsApi } from "./domains/settings/settings.api"
// ...
export const api = { ...agentsApi, ...settingsApi, ... }
```

Each domain adds its slice. Method-name collisions across domains are a
design smell — surface them rather than working around them.

## Rules

- Everything exported must be platform-agnostic. No DOM, no React Native primitives.
- React hooks are fine (both web and RN use React).
- Re-export from `src/index.ts` so consumers import `@huxflux/shared`, never deep paths.
- Inside the shared package, internal imports use direct paths (e.g. `./domains/agents/agents.types`, `./domains/agents/hooks/useAgent`). There is no per-domain barrel to go through.
- File-size cap is 400 lines (`.ts`). The `hooks/` subdirectory under
  `domains/agents/` is the example of splitting when a single file would
  exceed the cap.

## Query / mutation wrappers

`useHuxfluxQuery` and `useHuxfluxMutation` (in `src/useHuxfluxQuery.ts` and `src/useHuxfluxMutation.ts`) are the canonical hooks every web + mobile client uses for server I/O. They wrap TanStack's `useQuery` / `useMutation`:

- `useHuxfluxQuery` adds an `on` option: a map keyed by `ServerEvent["type"]` whose handlers patch the cache via `helpers.setData` / `helpers.invalidate` / `helpers.queryClient`. The event subscription is scoped to the component via the existing `useAgentEvents` plumbing.
- `useHuxfluxMutation` adds an `invalidate(data, variables) => QueryKey | QueryKey[]` option that runs in parallel before chaining to the caller's `onSuccess`.

Both files are pure React; the test runner here is Node-only so no hook tests live in this package. The web app's lint rule warns on direct `await api.x.y()` in components/hooks to keep callers on these wrappers.

## Testing

Vitest. Tests collocated next to source (`foo.ts` and `foo.test.ts`). The shared package is pure cross-platform logic, so tests here are simple: import the export, call it, assert on the return value. No DB, no spawn, no harness. The server harness lives at `apps/server/test/harness.ts` and is not visible from here.

Run via `pnpm test` from the repo root (whole workspace) or `pnpm --filter @huxflux/shared test`. No snapshot assertions — write explicit ones.
