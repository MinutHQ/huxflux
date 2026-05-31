---
name: scaffold-route
description: Create a new TanStack Router route file (web) that delegates to a domain. The route stays thin — the actual UI lives in the domain.
---

# scaffold-route

The user wants a new web route. TanStack Router file-based, located in `apps/web/src/routes/`.

## Arguments

- Route path (required, e.g. `settings`, `tasks`, `agent.$agentId`)
- Domain (required) — the domain the route delegates to
- Layout group (optional, default `_app` for authed app routes; use empty/none for top-level routes like `onboarding`, `settings`)

If anything is missing, ask once.

## Target file

- Inside the app layout: `apps/web/src/routes/_app/<path>.tsx`
- Top-level: `apps/web/src/routes/<path>.tsx`

The path may include `$paramName` segments (TanStack convention) and `.` separators (which become `/` at runtime).

## Template

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { <DomainComponent> } from '@/domains/<domain>'

export const Route = createFileRoute('<route-pattern>')({
  component: <DomainComponent>,
})
```

`<DomainComponent>` is whatever the domain's `index.ts` exports as its top-level view (often `<DomainName>Page` or just `<DomainName>`). Check the domain's README "Public surface" to find the right export name. If the domain has no view export yet, refuse — ask the user to add one first.

## Rules baked in

- The route file imports ONLY from the domain index, never from inside it.
- The route file stays under ~50 lines. If it's growing, the logic belongs in the domain.
- No business logic in the route file. Just routing + delegation.
- Use `@/domains/<domain>` — never relative paths.

## Steps

1. Verify the domain exists and has a view export in its `index.ts`. If not, refuse and explain.
2. Verify the route file doesn't already exist.
3. Write the file using the template.
4. Run `pnpm typecheck` to confirm the route compiles.
5. Report the path.

## Do not

- Do not put loaders, data fetching, or state inside the route file. Those belong in the domain.
- Do not import deep from a domain (`@/domains/x/components/Foo`). The eslint boundary rule will reject it.
