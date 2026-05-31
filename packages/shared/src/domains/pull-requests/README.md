# pull-requests

Cross-platform Zod schemas and API slice for everything pull-request-shaped: the GitHub status / review / checks / threads view, the standalone PR review page, and the agent-scoped PR badges.

## Owns

- Every PR-shape schema and type the web review page, the mobile per-agent PR pane, and the agent header consume (status, reviews, checks, threads, issue comments, file diffs, the "pending review draft" `ReviewComment` shape, etc.)
- The `prsApi` HTTP slice: repo-scoped GitHub endpoints (`/api/prs/:owner/:repo/...`) and agent-scoped PR endpoints (`/api/agents/:id/pr/...`). Every JSON response is validated against the matching entity schema via `reqValidated()`.
- The `repoId` to `owner/repo` split used by every repo-scoped endpoint
- The request-body schemas (`createPRBodySchema`, `mergePRBodySchema`, `replyToPRCommentBodySchema`, `singlePRCommentBodySchema`, `submitPRReviewBodySchema`) used by both the client api slice and the server routes.

## Public surface

- `prsApi` — PR HTTP slice, merged into the composed `api` object at the package root
- `prStatusSchema` — Zod schema for the PR-status shape attached to `Agent.prStatus` and broadcast over WS; `PRStatus` is its inferred type.
- `prReviewSchema` — Zod schema for a single approver / changes-requester / commenter review; `PRReview` is its inferred type.
- `prReviewStateSchema` — Zod enum schema for the review-state union; `PRReviewState` is its inferred type.
- `prCheckSchema` — Zod schema for a single CI check result; `PRCheck` is its inferred type.
- `prCheckStatusSchema` — Zod enum schema for the check-status union; `PRCheckStatus` is its inferred type.
- `prCheckConclusionSchema` — Zod schema for the check-conclusion union (nullable); `PRCheckConclusion` is its inferred type.
- `prCommentSchema` — Zod schema for a review-thread comment (with optional path / line for inline); `PRComment` is its inferred type.
- `prThreadSchema` — Zod schema for a grouped review thread (resolved / outdated / per-file); `PRThread` is its inferred type.
- `prIssueCommentSchema` — Zod schema for a top-level issue-style comment on the PR; `PRIssueComment` is its inferred type.
- `prDetailsSchema` — Zod schema for the full PR snapshot returned by `/api/prs/.../details` (extends `prStatusSchema`); `PRDetails` is its inferred type.
- `openPRSchema` — Zod schema for the open-PR summary shape returned by the GitHub-listing endpoint; `OpenPR` is its inferred type.
- `openPRWithRepoSchema` — Zod schema for `OpenPR` with the `repoId` / `repoName` it lives in; `OpenPRWithRepo` is its inferred type.
- `prFileSchema` — Zod schema for a single changed file (path, additions, deletions, status, patch); `PRFile` is its inferred type.
- `prFileStatusSchema` — Zod enum schema for the file-status union (`added` / `modified` / `deleted` / `renamed`); `PRFileStatus` is its inferred type.
- `prFileDiffSchema` — Zod schema for the narrowed file-diff shape used by the standalone files endpoint; `PRFileDiff` is its inferred type.
- `codeLineSchema` — Zod schema for the code-context line shape used by reviewer panels; `CodeLine` is its inferred type.
- `reviewCommentSchema` — Zod schema for the pending / queued / sent review draft entry (web review surface); `ReviewComment` is its inferred type.
- `pullRequestSchema` — Zod schema for the UI-facing aggregate combining open-PR data + file diffs + review status; `PullRequest` is its inferred type.
- `mergeMethodSchema` — Zod enum schema for the merge-method union (`merge` / `squash` / `rebase`); `MergeMethod` is its inferred type.
- `createPRBodySchema` — Zod schema for the `POST /api/agents/:id/pr` request body; `CreatePRBody` is its inferred type.
- `mergePRBodySchema` — Zod schema for the merge request body; `MergePRBody` is its inferred type.
- `replyToPRCommentBodySchema` — Zod schema for the reply-to-comment request body; `ReplyToPRCommentBody` is its inferred type.
- `singlePRCommentBodySchema` — Zod schema for the single-comment request body; `SinglePRCommentBody` is its inferred type.
- `submitPRReviewBodySchema` — Zod schema for the submit-review request body; `SubmitPRReviewBody` is its inferred type.
- `PRStatus` — small PR-status shape attached to `Agent.prStatus` and broadcast over WS
- `PRReview` — single approver / changes-requester / commenter review
- `PRReviewState` — review-state union
- `PRCheck` — single CI check result
- `PRCheckStatus` — check-status union
- `PRCheckConclusion` — check-conclusion union (nullable)
- `PRComment` — review-thread comment (with optional path / line for inline)
- `PRThread` — grouped review thread (resolved / outdated / per-file)
- `PRIssueComment` — top-level issue-style comment on the PR
- `PRDetails` — full PR snapshot returned by `/api/prs/.../details` (extends `PRStatus`)
- `OpenPR` — open-PR summary shape returned by the GitHub-listing endpoint
- `PRFile` — single changed file (path, additions, deletions, status, patch)
- `PRFileStatus` — file-status union
- `CodeLine` — code-context line shape used by reviewer panels
- `ReviewComment` — pending / queued / sent review draft entry (web review surface)
- `PullRequest` — UI-facing aggregate combining open-PR data + file diffs + review status
- `OpenPRWithRepo` — `OpenPR` with the `repoId` / `repoName` it lives in
- `PRFileDiff` — narrowed file-diff shape used by the standalone files endpoint
- `MergeMethod` — merge-method union (`merge` / `squash` / `rebase`)
- `CreatePRBody` — request body for `POST /api/agents/:id/pr`
- `MergePRBody` — request body for merging a PR (agent-scoped and repo-scoped)
- `ReplyToPRCommentBody` — request body for replying to a review comment
- `SinglePRCommentBody` — request body for posting a single review comment
- `SubmitPRReviewBody` — request body for submitting a GitHub review (event + body + inline comments)

## Depends on

- `../../apiBase` — `req`, `reqValidated`, `getApiBase`, `authHeaders` for the api slice
- `zod` for the runtime schemas
- No runtime React deps (no hooks in this domain yet)

## Sub-domains

None.

## Quirks

- Repo-scoped endpoints split `repoId` on `/` to get `owner` / `repo`. Callers must pass the canonical `owner/repo` string; passing anything else produces malformed URLs without throwing. The shape is enforced upstream by the GitHub client.
- `PRStatus` is also referenced by `domains/agents/pull-requests.types.ts` (`Agent.prStatus`). The agents domain imports `prStatusSchema` from this domain. If `PRStatus` ever grows runtime helpers, this is fine; if it grows agent-specific fields, reconsider the placement.
- `PRFileDiff` and `PRFile` overlap heavily. `PRFile` is the legacy shape used by the `PullRequest` aggregate, `PRFileDiff` is the narrower wire shape returned by `/api/prs/.../files`. They're kept as separate types to preserve the existing consumer call sites verbatim.
- No hooks live here yet. PR data is fetched via React Query in the consuming apps using the composed `api` object directly.
- This domain owns both repo-scoped and agent-scoped PR endpoints. Agent-scoped endpoints (`/api/agents/:id/pr/...`) operate on the agent's tracked PR by looking it up server-side; they belong here because the response shape is PR-centric.
