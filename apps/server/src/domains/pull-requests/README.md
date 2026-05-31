# pull-requests

The server-side surface for GitHub pull-request workflows: HTTP routes for listing review-requested PRs, fetching diffs and details, posting and submitting reviews, replying to inline threads, marking draft PRs ready, re-requesting review, merging, plus the Octokit-backed client that talks to GitHub.

## Owns

- The `/api/prs` REST surface: list (review-requested + already-reviewed), `:owner/:repo/:number` details / files / file-content, comment + submit-review + reply + delete-comment, thread resolve, owner/repo merge methods, and owner/repo merge.
- The `/api/agents/:id/pr/*` surface: agent-scoped PR details, create PR, mark draft as ready, re-request review, merge. Each route refreshes `prStatus` on the agent row and broadcasts an `agent:updated` event.
- The Octokit wrapper: PR creation, status, full details (REST + GraphQL review threads), file diffs and raw file content, branch info, merge / mark-ready / rerequest-review / allowed-merge-methods, single-comment posting (inline, side-snap, fallback to issue comment), submit-review (with diff-line snapping), thread resolve, plus the supporting helpers `createIssue` (used by feedback) and `listBranches` (used by repos).
- The PR-status helpers: `prStatusToAgentStatus` (maps PRStatus to agent column) and `parsePrStatus` (DB JSON to PRStatus | undefined). Used by the poller and the agents list route.

## Public surface

Top-level `.ts` files in this domain are public; subfolders (`routes/`, `service/`, `job/`) are private.

- `pull-requests.routes.ts` — exposes `pullRequestsPlugin`, the Fastify plugin registering every PR-related HTTP route. Wired through the registry at `src/domains/index.ts`.
- `prStatus.ts` — re-exports `prStatusToAgentStatus`, `parsePrStatus`, `getPRStatus`, `findPRForBranch` from `service/prStatus.ts`.
- `prDetails.ts` — re-exports `getPRDetails` (full PR details: reviews, checks, threads, issue comments, currentUser) from `service/prDetails.ts`.
- `prComments.ts` — re-exports `replyToReviewComment` (posts a reply to an inline review comment) from `service/prComments.ts`.
- `misc.ts` — re-exports `createIssue` (used by feedback) and `listBranches` (used by repos) from `service/misc.ts`.

## Depends on

- `src/db/index.ts` — Drizzle handle
- `src/domains/git/worktrees.ts` — `getRemoteUrl` (for matching a PR's owner/repo to a local repo and for resolving the remote when posting from an agent route)
- `src/domains/ws/handler.ts` — `broadcast` (every connection) used by agent-PR mutations to emit `agent:updated`
- `src/domains/agents/agents.ws.ts` — `agentsWs` (broadcast `agent:updated` after PR mutations)
- `src/domains/settings/settings.service.ts` — `getSettings`
- `src/config.ts` — `githubToken` (used to authenticate every Octokit call)
- `@octokit/rest`, `drizzle-orm`, `fastify` — runtime

## Sub-domains

None.

## Quirks

- This domain owns the background PR poller (`pull-requests.job.ts` + the `job/` subdir). `pullRequestsJob` is the per-agent loop that syncs branch names from the worktree, refreshes PR status via Octokit, and runs the PR-comment / CI / merge-conflict sub-monitors whose per-agent seen-state lives in `job/monitors.ts`. The poller is composed into the central registry at `src/jobs.ts`; the domain never starts its own timer.
- The shared `OpenPR` type (in `packages/shared/src/domains/pull-requests/types.ts`) and the server `OpenPR` / `OpenPRWithRepo` / `PRDetails` types (in `apps/server/src/types.ts`) were extended as part of an earlier extraction: `OpenPR` now has `reviewRequested?` / `userReviewed?` / `mergeableState?`, `OpenPRWithRepo` has `isReadyToMerge?`, and `PRDetails` has `currentUser?`.
- The 772-line legacy `routes/github.ts` was split by request shape into the current per-feature route files: `list.routes.ts` (the /api/prs index with agent-PR association), `details.routes.ts` (files / file-content / details), `comments.routes.ts` (post / submit / reply / delete / resolve), `agentPr.routes.ts` (every `/api/agents/:id/pr/*` route), and `merge.routes.ts` (owner/repo merge methods and merge).
- The 669-line legacy `github/client.ts` was split per concern: `octokit.ts` (Octokit factory + URL parser), `prStatus.ts` (status helpers + `getPRStatus` + `findPRForBranch`), `prDetails.ts` (REST + GraphQL aggregation), `listRequestedPRs.ts` (the search-issues flow), `prFiles.ts` (changed files + raw content), `prActions.ts` (create / merge / mark-ready / rerequest-review / allowed-methods), `prComments.ts` (reply / delete / single-comment posting), `submitReview.ts` (review submission with diff-line snapping), `diffSnap.ts` (`findNearestDiffLine`), `misc.ts` (`createIssue` / `listBranches` / `listOpenPRs`).
- The `agent as any` casts on `broadcast({ type: "agent:updated", agent })` are preserved from the legacy file. The `agentsTable` Drizzle row is morally `AgentSummary` but `streaming: 0 | 1` int vs `boolean` and `prStatus: string | null` vs `PRStatus | undefined` make a straight assignment fail. The fix is across the WS event shape + the client; out of scope here.
- The re-request review route keeps its inline guard checks (rather than going through the shared `loadAgentWithRepo` helper) so the original per-condition `console.info` debug lines are preserved verbatim.
- The `mergeableState` field on the `OpenPR` entries returned by `listReviewRequestedPRs` is intentionally left unpopulated by the legacy code, only the existing fields are returned. The type now allows it, and `isReadyToMerge` evaluates the same way it did before (currently always `false` for entries that come from the list endpoint). Wiring `mergeableState` into the result is a future improvement and not part of this structural extraction.
- `submitPRReview` snaps every inline comment to the nearest hunk line in the patch. Comments whose file isn't in the diff or whose patch has no valid line at all get appended to the review body with a `path:line` prefix so the reviewer's intent is preserved.
- `createSinglePRComment` tries RIGHT side first, then LEFT, then the nearest hunk line, then falls back to a plain issue comment with a `path:line` header. Preserved verbatim.
