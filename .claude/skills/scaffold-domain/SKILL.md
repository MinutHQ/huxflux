---
name: scaffold-domain
description: Create a new domains/<name>/ folder following the Huxflux domain pattern. Targets apps/web, apps/server, apps/mobile, or packages/shared. Sets up README.md and the standard subfolders.
---

# scaffold-domain

The user wants a new domain scaffolded. This skill produces a domain folder that passes lint checks by construction.

## Arguments

The user provides:
- The domain name (required, kebab-case, e.g. `tasks`, `pull-requests`, `agents`)
- The target platform (optional: `web` / `server` / `mobile` / `shared`)

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

Conditionally create files / directories (do NOT create empty ones for sake of completeness — only the ones likely needed). Top-level layer files follow the `<domain>.<layer>.ts` convention (e.g. `tasks.routes.ts`, `agents.db.ts`, `pull-requests.job.ts`). Hyphenated domains keep their hyphen.

- `<name>.routes.ts` — server (Fastify plugin file; top-level, registered in `domains/index.ts`)
- `service/` — server (private business logic). Subfolder contents stay bare-named; cross-domain consumers reach service symbols via a top-level re-exporter file you create per symbol group (e.g. `title.ts`, `prStatus.ts` — re-exporters keep bare descriptive names).
- `<name>.db.ts` — server (Drizzle tables / queries scoped to this domain)
- `<name>.api.ts` — shared (client-side API slice, composed in `src/api.ts`)
- `<name>.types.ts` — any platform (only if it has its own types)
- `<name>.ws.ts` — server (only if it emits WS events)
- `<name>.hooks.ts`, `<name>.state.ts`, `<name>.store.ts`, `<name>.schema.ts` — shared (per the layer table)
- `<name>.job.ts` — server (background scheduled work; replaces the older `poller.ts`)
- `components/`, `hooks/`, `screens/`, `dialogs/`, `views/` — web, mobile (UI surfaces, all private to the domain)

When in doubt, create only `README.md`. The user can ask to add more later.

### 2. README.md template

```markdown
# <name>

One-paragraph summary of what this domain is for.

## Owns

- <bullet listing each thing this domain owns>

## Public surface

<bulleted list of every top-level file in the domain. Format: "- `<File>.ts` — one-line description of what it exposes". Empty list is allowed but must include a placeholder bullet like "- (none yet)" while the domain is empty.>

## Depends on

- <list other domains / packages this imports from. e.g. "- `@huxflux/shared`", "- `domains/agent-runner/agent-runner.service.ts`">

## Sub-domains

<only include this section if sub-domains/ exists. Otherwise omit.>

## Quirks

<only include this section if there's something non-obvious. Otherwise omit.>
```

## Steps

1. Verify the target directory does not already exist. If it does, refuse and tell the user.
2. Create the directory and the README.
3. Run `node scripts/check-domains.mjs` to confirm the scaffold passes.
4. Report the path, list the files created, and remind the user to fill in the README sections and add real top-level files as the public surface grows.

## Do not

- Do not create an `index.ts` (per-domain barrels do not exist).
- Do not create empty subdirectories "just in case".
- Do not add a CLAUDE.md inside the domain. The root and per-app CLAUDE.md govern.
- Do not assume the platform. Ask if not provided.
