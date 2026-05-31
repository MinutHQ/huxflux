# apps/web — Agent Rules

Vite + React 19 + TypeScript + TanStack Router/Query. The primary client.

Read the root CLAUDE.md first. This file only documents what's specific to the web app.

## Layout

```
src/
  domains/<name>/    Feature code lives here. See root CLAUDE.md for the pattern.
  app-shell/         Top-level layout, command palette, error boundary, banners, title bar.
  routes/            TanStack Router file-based routes (thin — delegate to a domain).
  lib/               Web-only cross-cutting helpers (theme, sounds, flags, platform).
  hooks/             Web-only cross-cutting hooks that aren't part of the app-shell chrome.
                     Four hooks live here today:
                       - useAppContext   reads the embedded-context handshake (Tauri / iframe).
                       - useServers      fetches the configured backend servers list.
                       - useServerStatus polls the active server's reachability + version.
                       - useUpdater      drives the Tauri auto-updater check + install flow.
                     Domain hooks go in their domain. App-frame hooks tied to UI state
                     (workspace tabs, notifications) live in app-shell/ instead.
  assets/            Static assets imported by source.
```

Components live in `src/domains/<x>/components/` and `src/app-shell/` only. The flat `components/` directory was removed when the web migration completed; if you find yourself wanting to drop a component into `app-shell/` that isn't shell chrome, it belongs in a domain.

## Routes

- File-based routes via TanStack Router (`src/routes/`).
- Route files stay thin: import a domain's top-level component file directly and render it (`import { TasksView } from "@/domains/tasks/TasksView"`).
- If a route file grows past ~50 lines, the logic belongs in the domain.

## Imports

- `@/*` resolves to `apps/web/src/*`.
- Cross-domain imports point at a specific TOP-LEVEL file in the target domain (e.g. `@/domains/agents/AgentList`, `@/domains/tasks/types`). Per-domain `index.ts` barrels no longer exist; subfolders are domain-internal. See the root CLAUDE.md "Public Surface Rule".
- Use `@huxflux/shared` for cross-platform types/hooks/api.
- Use `@huxflux/ui` for primitives.
- Use `@huxflux/tokens` for tokens.

## State

- Server state: TanStack Query.
- Local UI state: React state / `useReducer`.
- No new global stores. Talk it through if you think you need one.

## Data fetching

All client-side server I/O goes through the two wrapper hooks in `@huxflux/shared`. Direct `await api.x.y()` inside a React component or hook is lint-warned because it bypasses TanStack Query's cache, drops WebSocket-driven cache reactivity, and grows ad-hoc try/catch + manual `queryClient.invalidateQueries(...)` boilerplate at every call site.

### Reads — `useHuxfluxQuery`

Drop-in for `useQuery` with one extra option: `on`. Each handler reacts to a WebSocket event (typed by the `ServerEvent` union) and patches the cache via the supplied `helpers`:

```tsx
const { data: agent } = useHuxfluxQuery({
  queryKey: queryKeys.agents.detail(agentId),
  queryFn: () => api.agents.get(agentId),
  on: {
    "agent:updated": (event, h) => { if (event.agent.id === agentId) h.setData(event.agent) },
    "agent:deleted": (event, h) => { if (event.agentId === agentId) h.invalidate() },
  },
})
```

If the consumer doesn't react to events, omit `on`. The return shape is identical to `useQuery`.

### Mutations — `useHuxfluxMutation`

Wraps `useMutation` with a declarative `invalidate` option. Return one `QueryKey` or an array of them; the hook invalidates all in parallel before chaining to `onSuccess`:

```tsx
const deleteAgent = useHuxfluxMutation({
  mutationFn: () => api.agents.delete(agentId),
  invalidate: () => queryKeys.agents.list(),
  onSuccess: () => navigate({ to: "/agents" }),
  onError: (err) => toast.error(err.message),
})
deleteAgent.mutate()
```

### Fire-and-forget escape hatch

Some flows (clipboard reads, native Tauri invokes, optimistic-rollback streams) genuinely don't fit the query/mutation shape. Silence the lint rule with a `// fire-and-forget; intentional` comment and a `// eslint-disable-next-line no-restricted-syntax` directive on the call site. Reviewers should look for the justification, not the disable.

## Styling

- Tailwind v4 via `@tailwindcss/vite` plugin. Config lives in CSS (`src/index.css`).
- Always use CSS-variable classes from the design system, not hardcoded color scales. See root CLAUDE.md.
- Inter Variable via `@fontsource-variable/inter`.

## Testing

No test setup. Do not add one without explicit user request.

