---
name: scaffold-server-domain
description: Create a new apps/server/src/domains/<name>/ folder following the Huxflux server domain pattern. Sets up README.md, <name>.routes.ts skeleton, and appends the new plugin to the server domain registry.
---

# scaffold-server-domain

The user wants a new server-side domain scaffolded. This skill produces a domain folder that passes lint + check-domains by construction, and wires it into the server's auto-registration loop.

## Arguments

The user provides:
- The domain name (required, kebab-case, e.g. `tasks`, `pull-requests`, `repos`)

Do not assume — if the name is missing or ambiguous, ask once.

## Target directory

`apps/server/src/domains/<name>/`

## What to create

### 1. The directory and standard files

Always create:

- `README.md` — see template below
- `<name>.routes.ts` — Fastify plugin skeleton (top-level file = public surface). Follows the `<domain>.<layer>.ts` convention.

Per-domain `index.ts` barrels do not exist. The set of top-level files in the domain IS the public surface. Cross-domain consumers import directly from those files (`import { <name>Plugin } from "../<name>/<name>.routes.js"`).

Optional files (create only if relevant). Each follows the `<domain>.<layer>.ts` naming convention:

- `routes/` directory — when the domain has many endpoints, split per-feature route files (private to the domain). Files inside this folder keep bare descriptive names (e.g. `crud.routes.ts`).
- `<name>.service.ts` (or `service/` directory) — business logic. Single-file form uses the prefix; subfolder is private and its contents stay bare. Expose public symbols via a top-level re-exporter named after the symbol group (keeps a bare descriptive name, e.g. `title.ts`).
- `<name>.db.ts` — Drizzle table definitions and queries scoped to this domain.
- `<name>.types.ts` — domain-internal types.
- `<name>.ws.ts` — WS event types emitted by this domain.
- `<name>.job.ts` — background scheduled job (renamed from the older `poller` term). Exports a `Job` (see `src/jobTypes.ts`); registered in `src/jobs.ts`.
- `<Symbol>.ts` — thin top-level re-exporter when a public symbol lives in a private subfolder (e.g. `title.ts` re-exporting `service/title.ts`). Re-exporters keep bare descriptive names.

Hyphenated domains include the hyphen in their prefix: `agent-runner.service.ts`, `pull-requests.routes.ts`, `pull-requests.job.ts`.

### 2. README.md template

```markdown
# <name>

One-paragraph summary of what this domain is for on the server side.

## Owns

- <bullet listing each HTTP surface, service, or behaviour this domain owns>

## Public surface

- `<name>.routes.ts` — exposes `<name>Plugin`, registered via the domain registry
- (additional top-level files, e.g. `<name>.service.ts`, `title.ts`)

## Depends on

- `src/db/...` — schema (shared)
- (other modules this domain reads from)

## Sub-domains

<omit unless sub-domains/ exists>

## Quirks

<omit unless something is non-obvious>
```

### 3. <name>.routes.ts template

```ts
import type { FastifyPluginAsync } from "fastify"

/**
 * Fastify plugin for the <name> domain. Registered via
 * `src/domains/index.ts` (the plugin registry). Add HTTP endpoints below —
 * split into `routes/` sub-files when this file gets close to the 400-line cap.
 */
export const <name>Plugin: FastifyPluginAsync = async (app) => {
  // Register routes here.
  void app
}
```

The `void app` keeps lint happy until the first real route lands. Remove it when adding endpoints.

### 4. Register the plugin

Append the new plugin to `apps/server/src/domains/index.ts`. The file is the cross-domain plugin registry (NOT a per-domain barrel — those are gone). It imports each plugin from the target domain's `<name>.routes.ts` directly:

```ts
import type { FastifyPluginAsync } from "fastify"
import { agentsPlugin } from "./agents/agents.routes.js"
import { reposPlugin } from "./repos/repos.routes.js"
// ...other existing plugin imports
import { <name>Plugin } from "./<name>/<name>.routes.js"

export const domainPlugins: FastifyPluginAsync[] = [
  agentsPlugin,
  reposPlugin,
  // ...other existing plugins
  <name>Plugin,
]
```

Order in the array determines route registration order. Keep it grouped by extraction order; only change it when route paths collide (rare).

## Steps

1. Verify the target directory does not already exist. If it does, refuse and tell the user.
2. Create the directory and the two required files (README + `<name>.routes.ts`).
3. Update `apps/server/src/domains/index.ts` to include the new plugin.
4. Run `node scripts/check-domains.mjs` to confirm the scaffold passes.
5. Report the path, list the files created, and remind the user to fill in the README sections, then add the first route or service file.

## Do not

- Do not create an `index.ts` (per-domain barrels do not exist).
- Do not create empty subdirectories "just in case".
- Do not add a CLAUDE.md inside the domain. The root + `apps/server/CLAUDE.md` govern.
- Do not register the plugin directly in `apps/server/src/index.ts` — it goes through the registry.
- Do not invent a new pattern. Mirror the `agents` domain when uncertain.
- Do not name layer files without the `<domain>.<layer>.ts` prefix. The bare names (`routes.ts`, `db.ts`, etc.) are the OLD convention.
