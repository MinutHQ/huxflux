# repos

The server-side surface for registered git repositories: list, create, patch, delete, branch lookup, plus the clone and quick-start scaffolds. Setup-script edits also drive maintenance of each repo's hidden reserve worktree.

## Owns

- The `/api/repos` REST surface: GET list, POST create (rejects duplicate paths with 409), PATCH partial update (also kicks the reserve refresh when `setupScript` changes), DELETE (cascades into `agents` because the FK lacks ON DELETE CASCADE)
- The `/api/repos/:id/branches` endpoint that resolves the remote URL and asks GitHub for the branch list
- The `/api/repos/clone` endpoint: clones a remote git URL into a caller-supplied location, auto-detects the default branch, and registers the result
- The `/api/repos/quick-start` endpoint: scaffolds a new project from a template (empty / Vite / TanStack Start), initialises a git repo if the scaffold didn't, then registers it
- The path-resolution / branch-detection helpers used by the clone and quick-start endpoints, plus the fire-and-forget reserve-worktree maintenance helper called from the PATCH handler when the setup script changes

## Public surface

- `repos.routes.ts` — exposes `reposPlugin`, the Fastify plugin registering every `/api/repos*` HTTP route. Wired through the registry at `src/domains/index.ts`.

## Depends on

- `src/db/index.ts` — Drizzle handle (the `repos` Drizzle table now lives in this domain's own `repos.db.ts`; the schema barrel still re-exports it for cross-domain consumers)
- `src/domains/git/pool.ts` — `ensureReserve`, `drainReserves` (used by `maintainReserveOnSetupScriptChange`)
- `src/domains/git/worktrees.ts` — `getRemoteUrl` (used by branch listing)
- `src/domains/pull-requests/misc.ts` — `listBranches`
- `src/config.ts` — `workspacesBase` default
- `src/types.ts` — `Repo`
- `uuid`, `simple-git`, `fastify`, `drizzle-orm` — runtime
- `node:child_process`, `node:fs`, `node:path`, `node:os` — system

## Sub-domains

None.

## Quirks

- DELETE manually deletes the dependent `agents` rows because the SQLite FK constraint was created without `ON DELETE CASCADE` and SQLite cannot alter that after the fact.
- The PATCH handler's reserve-worktree refresh is fire-and-forget — the route returns immediately, the drain/recreate runs in the background. Errors are logged to console but never surface to the API caller. Verbatim from the source.
- `resolvePath` only handles the `~/` prefix; absolute paths and other shell metacharacters pass through unchanged. Callers that pass shell-expanded paths get them as-is.
- Quick-start splits responsibilities across a small chain of helpers (`runScaffold`, `maybeInitGitRepo`, `finalizeQuickStartRepo`) to keep every function inside the 80-line cap. The behaviour matches the legacy `routes/repos.ts` POST handler line-for-line.
- The clone and quick-start handlers use a 120-second timeout for the actual scaffold/clone step; the git-init follow-up uses 5-second timeouts. Verbatim.
- DB queries live inline in the route handlers, matching the agents-domain pattern. The Drizzle table definition is now in `repos.db.ts`; per-domain *query helpers* are still pending — when introduced they'll be the consumer of this `repos.db.ts`.
