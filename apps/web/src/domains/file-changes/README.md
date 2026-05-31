# file-changes

Right-pane viewers for an agent's file changes: the unified file tree, the stacked all-files diff, the single-file diff renderer, the single-file content viewer, the per-agent PR comments tab, the stacked "Changes" all-files list with sticky per-file headers, and the tabbed file-viewer chrome that hosts every viewer. Also exposes the diff theme helper used by the WorkerPoolContextProvider and the chat theme hook.

## Owns

- The right-pane file/diff/PR tabbed view rendered next to the chat
- Unified file tree (all files vs. changed-only, search, optional file-list sidebar)
- Stacked diff list with batch-fetched diffs and per-file inline diff rendering
- Syntax-highlighted unified/split diff for a single file, with optional inline comment composer
- Single-file content viewer with read mode (light syntax tokens) and edit mode (Cmd+S to save)
- Per-agent PR comments tab body: reviews / checks / merge status cards, merge action bar, review threads, discussion list
- The stacked "Changes" view with sticky per-file headers and on-demand diff bodies (used as a viewer tab)
- The file-viewer panel: the tabbed chrome that hosts each viewer (diff, content, changes, diff-browser, PR) and renders the active one
- Diff theme resolver (light/dark to `vesper` / `github-light`)

## Public surface

- `FileChangesView` — the top-level right-pane view (used by the agent route). Renders the pierre `FileTreeView` with an "All files" / "Diff" / "PR" tab strip; the diff tab filters the same tree to changed files only.
- `StackedDiffView` — stacked all-files inline diff. Used by the "Open in full view" surface in `FileViewerPanel` and `ChatFileContent`, not by the diff tab.
- `AgentPRTab` — per-agent PR comments / review tab body (used by chat's PR tab)
- `DiffView` — single-file syntax-highlighted diff
- `FileContentView` — read-only single-file content viewer with shiki syntax highlighting via `@pierre/diffs`
- `ChangesView` — stacked all-files list with sticky per-file headers (the "Changes" viewer tab body)
- `FileViewerPanel` — tabbed chrome that hosts every viewer (diff, content, changes, diff-browser, PR)
- `getDiffTheme` — returns the active pierre/diffs theme name; consumed by chat's `useDiffTheme` and the agent route's worker pool provider

## Depends on

- `@huxflux/shared` — `Agent`, `FileChange`, `PRComment`, `PRCheck`, `PRThread`, `PRIssueComment`, `PRDetails`, `api`, `useRepos`
- `@huxflux/ui` — primitives (Button, ScrollArea, Popover, cn)
- `@pierre/diffs`, `@pierre/diffs/react` — diff parsing + `FileDiff` renderer, `resolveTheme` for tree theme styles
- `@pierre/trees`, `@pierre/trees/react` — virtualised `FileTree` + `useFileTree` powering the "All files" tree view
- `@tabler/icons-react` — icons
- `react-markdown`, `remark-gfm` — PR comment body rendering
- `sonner` — toast notifications for PR mutations
- `@tanstack/react-query` — file tree / diff / PR details fetching and invalidation
- `@/lib/diffPrefs` — persisted diff view mode and file-list visibility
- `@/lib/platform` — `handleExternalClick` for external PR links
- `@/lib/theme` — resolved theme used by `getDiffTheme`

## Sub-domains

None.

## Quirks

- `AgentPRTab` was named `PRView` in the legacy `components/FileChangesView.tsx`. It was renamed to avoid colliding with the unrelated full-screen PR review page (the `/review/$prId` route surface), which now lives in `@/domains/pull-requests` as its own `PRView` component. The chat domain still imports `AgentPRTab` under the alias `PRTabView` for its internal naming.
- The diff tab in `FileChangesView` reuses the pierre `FileTree` (the same component the "All files" tab uses) with the tree filtered to changed files only. The dense `StackedDiffView` is reserved for the "Open in full view" surface, opened from the file viewer or chat's diff-browser tab.
- `STACKED_DIFF_THRESHOLD` (currently 100) is retained as a defensive cap for diff-browser surfaces that still render inline diffs.
- `StackedDiffView` uses a custom `React.memo` comparator: data is owned by the internal `useQuery`, so the component intentionally only re-renders when `agentId`, `search`, `showFileList`, `pendingComments.length`, or `fileChanges.length` change. The `fileChanges.length` dependency is what triggers `queryClient.invalidateQueries(["all-diffs"])` when the agent adds or removes a file, otherwise the batch query would go stale.
- `FileContentView` uses `codeToHtml` from `@pierre/diffs` for shiki syntax highlighting and subscribes to the `huxflux:theme-change` window event via `useSyncExternalStore`. Read-only by design; the edit/save flow was removed in this branch.
- `DiffView` also uses a manual `React.memo` comparator with the same intent (avoid re-rendering on unrelated parent re-renders).
- `useDiffTheme` is implemented locally inside the domain and listens to the `huxflux:theme-change` window event. The chat domain re-implements the same hook so its `useDiffTheme` doesn't pull this module's internals; both share the underlying `getDiffTheme` from this domain's public surface.
- Several legacy color usages in `fileColor` (file-extension icon hues) were `text-zinc-*`. These were swapped to `text-muted-foreground/*` variants when extracting, because the design-system lint rule forbids zinc/slate/gray Tailwind scales.
- The pierre/diffs `FileDiff` options/annotation props are intentionally generic, so the `DiffView` call site has three `@typescript-eslint/no-explicit-any` casts. These are scoped to the boundary with the library and not propagated outward.
- `FileTreeView` uses pierre's virtualised `FileTree` renderer. For git agents it flattens the full repo tree into a single path list and resets pierre wholesale; for folder agents (repos with `type: "folder"`) it incrementally fetches each directory's children on expansion via `model.subscribe` polling, because pierre doesn't emit explicit expand events. Git status decoration is fed from `fileChanges` and re-applied via `model.setGitStatus` on every change.
- `useTreeThemeStyles` resolves the active pierre/diffs theme (vesper / github-light) and merges in our design-system CSS variables so the pierre tree inherits the app's card/muted/accent palette. Resolved themes are cached by name to avoid re-running the async resolver on every render after a theme toggle.
- `stripHtml` in `utils.ts` uses regex-based HTML stripping with `\x00CODE…\x00` placeholders to preserve fenced code blocks. The control-char placeholder is deliberate and the function comment explains the ordering invariants.
