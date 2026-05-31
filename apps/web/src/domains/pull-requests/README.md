# pull-requests

Standalone full-screen PR review page rendered at `/review/$prId`. The user lands here to inspect a single GitHub PR before merging it: read the description, walk the file diffs, leave inline comments, queue them as part of a review, and ship the review with an APPROVE / COMMENT / REQUEST_CHANGES verdict.

## Owns

- The full-screen PR review page (route `/review/$prId`)
- Header with PR number, title, branch arrows, author, CI status, merge readiness, and merge button
- Two-tab body: Conversations (PR summary + discussion + line-anchored threads) and Changes (per-file diff accordions + file tree)
- Inline review-comment composer rendered as `@pierre/diffs` annotation slots (new-comment form, locally-pending comments, persisted threads)
- localStorage-backed state for: pending review comments, viewed files, and the user's preferred diff style (unified vs split)
- Submit-review popover that bundles the queued inline comments + general body + verdict and posts them to GitHub

## Public surface

- `PRView` — the route-rendered top-level component for `/review/$prId`
- `usePRs` — TanStack Query fetcher that pulls the GitHub PR list, maps the server payload into the `PullRequest` UI shape (relative timestamps, review-status flags, default-empty file list)

## Depends on

- `@huxflux/shared` — `api`, `PullRequest`, `PRFile`, `ReviewComment`, `CodeLine`, `PRThread`, `PRComment`, `PRIssueComment`
- `@huxflux/ui` — primitives (Button, ScrollArea, Popover, ResizablePanelGroup, cn)
- `@pierre/diffs`, `@pierre/diffs/react` — `PatchDiff`, `SelectedLineRange`, `DiffLineAnnotation`
- `@tabler/icons-react` — icons
- `react-markdown`, `remark-gfm` — markdown rendering (two renderers: `MarkdownContent` for normal flow, `InlineMd` for shadow-DOM annotation slots)
- `sonner` — toast notifications for merge / comment actions
- `@/lib/platform` — `openExternal`, `handleExternalClick`

## Sub-domains

None.

## Quirks

- The four PR-review types (`PullRequest`, `ReviewComment`, `PRFile`, `CodeLine`) were migrated from the legacy `apps/web/src/data/mockReviews.ts` into `packages/shared/src/pull-requests.types.ts` as part of an earlier extraction. The mockReviews shim has been deleted; all callers (`Sidebar`, `usePRs`, and PRView itself) now import these types from `@huxflux/shared`.
- The standalone `PRView` here is **not** the same component as `AgentPRTab` in `@/domains/file-changes`. AgentPRTab is the per-agent PR-comments tab that lives inside an agent's right pane; PRView is the full-page surface a reviewer opens before merging. They share no code today (the two flows diverged before the extraction), but both rely on shared PR types from `@huxflux/shared`.
- Two markdown renderers exist on purpose: `MarkdownContent` (Tailwind classes) for normal document flow, and `InlineMd` (inline styles) for slots rendered inside `@pierre/diffs`'s shadow DOM, where Tailwind classes do not penetrate. Same for `diffSlotStyles.ts` — the slot UI must use plain CSS objects.
- `DiffWithInlineComments` has one `eslint-disable @typescript-eslint/no-explicit-any` on the `diffInstanceRef`: the `@pierre/diffs` instance type is not exported by the library, so the ref is `any` only at the library boundary.
- `usePRDetails` ignores the typed response shape from `api.getPRDetailsForRepo` with one `@typescript-eslint/no-explicit-any` cast on the callback parameter, because the server endpoint returns a few fields (`checks`, `mergeableState`, `url`) that are not yet in the shared `PRDetails` type. This is intentional and will tighten when the server contract is updated.
- The annotation-side `useEffect` in `DiffWithInlineComments` calls `diffInstanceRef.current?.rerender()` after a 50ms timeout because the diff library needs the slotted children to commit before its render cache picks them up.
- `expandedFiles` defaults to "every not-yet-viewed file is expanded" so a first-time reviewer immediately sees all unread file diffs. After file diffs load, `usePRDetails` rehydrates this set from localStorage's `huxflux:pr-viewed:<repoId>:<prNumber>` key.
- The legacy `Submit review` button used `bg-white text-gray-900` for an inverted high-contrast CTA. Those forbidden gray/white tokens were swapped to `bg-foreground text-background` (and `bg-background/15 text-background` for the badge) during the extraction. Visually similar in both light and dark mode; flag in a follow-up if the design intent was specifically "always-light" regardless of theme.
- A few hardcoded hex literals remain inside arbitrary-value selectors: `bg-[#0d1117]` (diff hunk preview in `ThreadCard`) and `bg-[#0d0d0d]` (code context background in `SubmitReviewPopover`). These predate the design tokens for code-block backgrounds and survived the extraction unchanged. They pass lint because the forbidden-color regex only matches named scales.
