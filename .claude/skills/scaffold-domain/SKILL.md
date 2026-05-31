---
name: scaffold-domain
description: Create a new domains/<name>/ folder following the Huxflux domain pattern. Targets web, server, mobile, or shared. For server domains, also creates the routes plugin and registers it.
---

# scaffold-domain

The user wants a new domain scaffolded. This skill produces a domain folder that passes lint checks by construction.

## Arguments

The user provides:
- The domain name (required, kebab-case, e.g. `tasks`, `pull-requests`, `agents`)
- The target platform (required: `web` / `server` / `mobile` / `shared`)

If the platform is missing, ask once before scaffolding. Do not assume.

## Target directories

| Platform | Path |
|----------|------|
| web | `apps/web/src/domains/<name>/` |
| server | `apps/server/src/domains/<name>/` |
| mobile | `apps/mobile/domains/<name>/` |
| shared | `packages/shared/src/domains/<name>/` |

## What to create

### 1. The directory and standard files

Always create:
- `README.md` — see template below

Per-domain `index.ts` barrels do not exist. Top-level `.ts`/`.tsx` files inside the domain are the public surface; subfolders are domain-internal. See the root `CLAUDE.md` "Public Surface Rule".

Conditionally create files / directories (do NOT create empty ones for sake of completeness, only the ones likely needed). Top-level layer files follow the `<domain>.<layer>.ts` convention (e.g. `tasks.routes.ts`, `agents.db.ts`, `pull-requests.job.ts`). Hyphenated domains keep their hyphen.

**All platforms:**
- `<name>.types.ts` — only if it has its own types

**Server-specific (always create `<name>.routes.ts`):**
- `<name>.routes.ts` — Fastify plugin file (top-level, registered in `domains/index.ts`). See routes template below.
- `service/` — private business logic. Subfolder contents stay bare-named; cross-domain consumers reach service symbols via a top-level re-exporter.
- `<name>.db.ts` — Drizzle tables / queries scoped to this domain
- `<name>.ws.ts` — only if it emits WS events
- `<name>.job.ts` — background scheduled work

**Web / mobile-specific:**
- `components/`, `hooks/`, `screens/`, `dialogs/`, `views/` — UI surfaces, all private to the domain

**Shared-specific:**
- `<name>.api.ts` — client-side API slice, composed in `src/api.ts`
- `<name>.hooks.ts`, `<name>.state.ts`, `<name>.store.ts`, `<name>.schema.ts`

When in doubt, create only `README.md` (plus `<name>.routes.ts` for server). The user can ask to add more later.

### 2. README.md template

```markdown
# <name>

One-paragraph summary of what this domain is for.

## Owns

- <bullet listing each thing this domain owns>

## Public surface

- `<file>.ts` — one-line description of what it exposes
- (none yet)

## Depends on

- <list other domains / packages this imports from>

## Sub-domains

<only include this section if sub-domains/ exists. Otherwise omit.>

## Quirks

<only include this section if there's something non-obvious. Otherwise omit.>
```

### 3. Server routes template (server target only)

```ts
import type { FastifyPluginAsync } from "fastify"

/**
 * Fastify plugin for the <name> domain. Registered via
 * `src/domains/index.ts` (the plugin registry). Add HTTP endpoints below.
 * Split into `routes/` sub-files when this file gets close to the 400-line cap.
 */
export const <name>Plugin: FastifyPluginAsync = async (app) => {
  // Register routes here.
  void app
}
```

### 4. Register the plugin (server target only)

Append the new plugin to `apps/server/src/domains/index.ts`:

```ts
import { <name>Plugin } from "./<name>/<name>.routes.js"

// Add to the domainPlugins array:
export const domainPlugins: FastifyPluginAsync[] = [
  // ...existing plugins
  <name>Plugin,
]
```

## Steps

1. Verify the target directory does not already exist. If it does, refuse and tell the user.
2. Create the directory, README, and platform-specific files.
3. For server: update `apps/server/src/domains/index.ts` to include the new plugin.
4. Run `node scripts/check-domains.mjs` to confirm the scaffold passes.
5. Report the path, list the files created, and remind the user to fill in the README sections.

## Do not

- Do not create an `index.ts` (per-domain barrels do not exist).
- Do not create empty subdirectories "just in case".
- Do not add a CLAUDE.md inside the domain. The root and per-app CLAUDE.md govern.
- Do not assume the platform. Ask if not provided.
- For server: do not register the plugin directly in `apps/server/src/index.ts`, it goes through the domain registry.
- Do not invent a new pattern. Mirror the `agents` domain when uncertain.
