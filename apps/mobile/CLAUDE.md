# apps/mobile — Agent Rules

Expo React Native.

Read the root CLAUDE.md first.

## Layout

```
app/                 Expo Router file-based routes. Route files are THIN
                     wrappers (under ~15 lines) that import a screen from
                     `domains/<x>/` and render it. The only logic in a route
                     file is `useLocalSearchParams` / param plumbing.
domains/<name>/      Feature code. Mirrors web domain names where the feature
                     exists on both. Screens live under `domains/<name>/screens/`,
                     sub-components under `components/`, hooks under `hooks/`.
                     Four domains today: agents, pull-requests, settings, servers.
ui/                  Mobile-only UI primitives (`Modal`, `Sheet`). Mirrors the
                     shape of `packages/ui` but built on React Native instead
                     of React DOM. Consumers import from `@/ui`.
lib/                 Cross-cutting helpers (`prefs.ts`, `setupMessage.ts`).
                     Domain-specific hooks live in `domains/<x>/hooks/`.
plugins/             Expo config plugins.
assets/              Static assets.
theme.ts             Mobile theme tokens (RN StyleSheet equivalent of CSS vars).
```

## Expo Router boundary

`app/` is filesystem-routed by Expo Router — every `.tsx` file there IS a route. You CANNOT move route files out of `app/`. The contract is:

- A **route file** in `app/...` is THIN: it imports a screen component from a domain and renders it. It owns the `useLocalSearchParams` call (which only works inside the Expo Router context).
- The **screen component** lives in `domains/<name>/screens/<Name>Screen.tsx` and accepts params as props.
- Sub-components, hooks, and helpers live in `domains/<name>/components/` / `hooks/` / `utils.ts` etc.

The `_layout.tsx` files (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/agent/[id]/_layout.tsx`) are Expo Router infrastructure — they orchestrate routing and stay in `app/`.

Example route shape:

```tsx
// app/agent/[id]/index.tsx
import { useLocalSearchParams } from "expo-router"
import { AgentDetailScreen } from "@/domains/agents/AgentDetailScreen"
export default function AgentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <AgentDetailScreen agentId={id!} />
}
```

## Cross-platform sharing

- Types, business logic, API client, WebSocket: `@huxflux/shared` (the `domains/agents` slice in the shared package is what every screen on this app consumes).
- Primitives that work on RN: `@huxflux/ui` (where applicable — many web primitives are DOM-only).
- Domain names mirror web. If web has `domains/tasks`, mobile has `domains/tasks` with the same public surface where it makes sense.

## Imports

- `@/*` resolves to `apps/mobile/*` (configured in `tsconfig.json` + `metro.config.js`).
- Cross-domain imports point at a specific TOP-LEVEL file (e.g. `@/domains/agents/AgentDetailScreen`, `@/domains/pull-requests/AgentPRPane`). Per-domain `index.ts` barrels no longer exist; subfolders are domain-internal.
- Use `@huxflux/shared` for cross-platform types/hooks/api.
- Use `@huxflux/tokens` for tokens.
- Domain code is free to use relative imports inside its own directory.

## Styling

- Use `@huxflux/tokens` for color values where possible.
- The mobile theme (`apps/mobile/theme.ts`) is the RN StyleSheet equivalent of the CSS-variable palette — `c.bg`, `c.fg`, `c.fgSub`, `c.fgBright`, `c.border`, `c.secondary`, `c.card`, `c.placeholder`, plus the semantic colors (`c.success`, `c.error`, `c.warning`, `c.link`, `c.addBg`, `c.delBg`, `c.merged`).
- No Tailwind on mobile.

## Data fetching

Same rule as web. All client-side server I/O goes through `useHuxfluxQuery` (reads) and `useHuxfluxMutation` (mutations), both exported from `@huxflux/shared`. Direct `await api.x.y()` inside a screen, component, or hook is lint-warned.

### Reads — `useHuxfluxQuery`

Drop-in for `useQuery` with an extra `on` option for declarative WebSocket reactivity:

```tsx
const { data: agent } = useHuxfluxQuery({
  queryKey: queryKeys.agents.detail(agentId),
  queryFn: () => api.agents.get(agentId),
  on: {
    "agent:updated": (event, h) => { if (event.agent.id === agentId) h.setData(event.agent) },
  },
})
```

### Mutations — `useHuxfluxMutation`

```tsx
const refresh = useHuxfluxMutation<unknown, void>({
  mutationFn: () => api.agents.refreshFiles(agentId),
  invalidate: () => queryKeys.agents.detail(agentId),
})
refresh.mutate()
```

### Fire-and-forget escape hatch

For flows that legitimately bypass TanStack Query (composite native calls, optimistic-rollback patterns, bulk sequential deletes) add `// fire-and-forget; intentional` and `// eslint-disable-next-line no-restricted-syntax` next to the call site.

## Modals / sheets

`apps/mobile/ui/Modal.tsx` is the RN-based modal primitive (`ModalProvider` at the root, `useModal()` for callers). Import it from the `@/ui` barrel. Don't try to use `@huxflux/ui`'s Modal — that's DOM-only.

## Testing

No test setup. Do not add one without explicit user request.
