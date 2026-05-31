---
name: promote-domain
description: Promote a flat directory (or set of related flat files) into a proper domains/<name>/ folder. Adds README, rewrites cross-domain consumers to import from top-level files in the new domain, and clears any matching legacy-path lint overrides.
---

# promote-domain

Use this skill when a flat directory or related set of flat files has grown enough to deserve domain status. Signals it is time:

- Substantial public surface (multiple files other code imports from).
- Cross-domain consumers (more than one caller outside the directory).
- Clear ownership boundary (the files all serve one feature area).

If the candidate is a single utility (`auth.ts`, `audit.ts`) or a framework-shaped directory (TanStack `routes/`, Expo `app/`), do NOT promote it. See "What this is NOT for" at the bottom.

## Arguments

The user provides:
- The source path or list of files (e.g. `apps/server/src/automations/`).
- The target domain name (kebab-case, e.g. `automations`).
- The target home (`apps/web` / `apps/server` / `apps/mobile` / `packages/shared`).

If any of these is missing, ask once before doing anything. Do not assume.

## Steps

### 1. Survey consumers

Find every importer before moving anything:

```sh
grep -rn "from \".*<old-path>/" <app>/src --include="*.ts" --include="*.tsx"
grep -rn "from '.*<old-path>/" <app>/src --include="*.ts" --include="*.tsx"
```

Also search for dynamic imports and requires (they will not show in the static grep above):

```sh
grep -rn "import(.*<old-path>" <app>/src --include="*.ts" --include="*.tsx"
grep -rn "require(.*<old-path>" <app>/src --include="*.ts" --include="*.tsx"
```

Note every consumer file. You will rewrite them in step 5.

### 2. Move with `git mv`

Use `git mv` so file history follows the move. Do not copy + delete.

```sh
git mv <app>/src/<old-path>/file.ts <app>/src/domains/<name>/file.ts
```

For a whole directory: `git mv <app>/src/<old-path> <app>/src/domains/<name>` (rename the target dir if the new domain name differs).

### 3. Adjust internal imports inside the moved files

Depth changed by one. Imports inside the moved files that pointed to siblings of the old flat dir now need an extra `../`:

- `../shared/foo` becomes `../../shared/foo`
- `./bar` (file inside the same dir) stays unchanged
- Imports of other domains via top-level files stay the same shape; just adjust depth.

Read each moved file. Do not rely on a global find-and-replace; some imports are already at the right depth.

### 4. Create `README.md`

Use the 5-section structure.

```markdown
# <name>

One-paragraph summary of what this domain is for.

## Owns

- <each thing this domain owns>

## Public surface

- `<File>.ts` — one-line description of what it exposes
- `<OtherFile>.ts` — one-line description

## Depends on

- <list other domains / packages this imports from>

## Sub-domains

<only include if sub-domains/ exists>

## Quirks

<only include if something non-obvious>
```

Match the format of an existing domain README in the same app (e.g. `apps/server/src/domains/git/README.md`).

Per-domain `index.ts` barrels do not exist. The set of top-level files in the domain IS the public surface; subfolders are private.

### 5. Rewrite consumers

Update every importer found in step 1 to point at a specific top-level file in the new domain:

- Cross-domain consumers: `import { Symbol } from "@/domains/<name>/<File>"` (web/mobile) or `from "../<name>/<File>.js"` (server). Layer files follow the `<name>.<layer>.ts` convention (e.g. `<name>.routes.ts`, `<name>.db.ts`).
- If the public symbol lives in a private subfolder, create a thin top-level re-exporter file named after the symbol (e.g. `title.ts` re-exports from `./service/title.ts`) and point consumers at it. Function-specific re-exporters keep bare descriptive names, not the `<name>.<layer>.ts` form.
- Files INSIDE the new domain keep importing each other directly. The boundary rule is for cross-domain reach only.

### 6. Register the domain (server only)

If this is a server-side domain, append the Fastify plugin to `apps/server/src/domains/index.ts` `domainPlugins` array. The registry imports each plugin from `<name>/<name>.routes.js` directly (no per-domain barrel). If the domain owns a background job, append it to `jobs.ts` too.

```ts
import { <name>Plugin } from "./<name>/<name>.routes.js"

export const domainPlugins: FastifyPluginAsync[] = [
  // ...existing plugins
  <name>Plugin,
]
```

### 7. Clear legacy lint overrides

`eslint.config.js` has `LEGACY_PATHS` and `SIZE_OVERRIDES` lists that enumerate files exempt from current rules. If any of the moved files appear in either list, remove those entries. The new domain location must not be added; only the old flat path is removed.

### 8. Update CLAUDE.md references

Grep for the old flat path across `CLAUDE.md` files. Any text that referred to it as a "migration target" or "outstanding flat directory" needs to be updated to reflect that the migration is done.

```sh
grep -rn "<old-flat-path>" --include="CLAUDE.md"
```

### 9. Run quality gates

Run all gates and confirm clean exit:

- `node scripts/check-domains.mjs` (should report +1 domain)
- `node scripts/check-migrations.mjs`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm test`

Fix any failures before reporting done.

## What this is NOT for

- **Single-file utilities** (`auth.ts`, `audit.ts`, helpers under `lib/`). These stay flat. The domain pattern is for substantial public surface, not every file.
- **Framework-shaped directories** (`apps/web/src/routes/**`, `apps/mobile/app/**`). These stay flat because TanStack Router and Expo Router require it.
- **Tiny modules** where README overhead would dwarf the actual code. If the domain would have one file and two exports, leave it flat.

## Do not

- Do not skip `git mv`. Renames must preserve history.
- Do not create an `index.ts` (per-domain barrels do not exist).
- Do not add a CLAUDE.md inside the domain. The root and per-app CLAUDE.mds govern.
- Do not bypass any gate. If something fails, fix it.
