# repos

Cross-platform type, API slice, and React Query hook for the registered git repositories the orchestrator tracks. Mirrors the server-side `repos` domain.

## Owns

- The `Repo` shape used by every UI that lists / picks / configures a repo
- The `reposApi` HTTP slice: CRUD on `/api/repos`, branch lookup, clone, quick-start scaffolds, plus the filesystem helpers (`/api/fs/repos`, `/api/fs/browse`, `/api/fs/default-branch`) that drive the repo path picker
- The `useRepos` TanStack Query hook keyed by the active server URL

## Public surface

- `reposApi` — repo HTTP slice, merged into the composed `api` object at the package root
- `useRepos` — TanStack Query hook returning the registered repos for the active server
- `repoSchema` — Zod schema for the `Repo` entity
- `createRepoBodySchema` — Zod schema for the body of `POST /api/repos`
- `updateRepoBodySchema` — Zod schema for the body of `PATCH /api/repos/:id`
- `cloneRepoBodySchema` — Zod schema for the body of `POST /api/repos/clone`
- `quickStartRepoBodySchema` — Zod schema for the body of `POST /api/repos/quick-start`
- `fsRepoEntrySchema` — Zod schema for one entry returned by `/api/fs/repos`
- `fsBrowseResponseSchema` — Zod schema for the response of `/api/fs/browse`
- `defaultBranchResponseSchema` — Zod schema for the response of `/api/fs/default-branch`
- `Repo` — registered git repository shape
- `CreateRepoBody` — request body shape for `POST /api/repos`
- `UpdateRepoBody` — request body shape for `PATCH /api/repos/:id`
- `CloneRepoBody` — request body shape for `POST /api/repos/clone`
- `QuickStartRepoBody` — request body shape for `POST /api/repos/quick-start`
- `FsRepoEntry` — one entry returned by `/api/fs/repos`
- `FsBrowseResponse` — response shape for `/api/fs/browse`
- `DefaultBranchResponse` — response shape for `/api/fs/default-branch`

## Depends on

- `../../api` — composed `api` object (for `useRepos`'s query function)
- `../../apiBase` — `req` for the api slice
- `../servers` — `getActiveServer` for the query key
- `react`, `@tanstack/react-query` — hook runtime

## Sub-domains

None.

## Quirks

- The `/api/fs/*` endpoints (`findRepos`, `browseFs`, `getDefaultBranch`) live here even though the URL prefix is `/api/fs/...` rather than `/api/repos/...`. They drive the add-repo path picker and have no other consumer, so the repos domain is their natural home; a separate "filesystem" domain would have one consumer.
- `getRepoBranches` lives in `reposApi` even though it talks to GitHub via the server. The endpoint is `/api/repos/:id/branches` and the response is a list of branch names; from the client's perspective it's repo-shaped.
- `useRepos` uses `getActiveServer()?.url` in its query key so switching servers re-fetches (same pattern as `useAgents`).
