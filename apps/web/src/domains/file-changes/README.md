# file-changes

Right-pane viewers for an agent's file changes: the unified file tree, the stacked all-files diff, the single-file diff renderer, the single-file content viewer, the per-agent PR comments tab, the stacked "Changes" all-files list with sticky per-file headers, and the tabbed file-viewer chrome that hosts every viewer. Also exposes the diff theme helper used by the WorkerPoolContextProvider and the chat theme hook.

## Owns

- The side pane's Diff section (`DiffPane`): changed-files tree with +/- counts on the left, every changed file stacked on the right with sticky collapsible headers, lazily mounted diff bodies, a `base › branch` crumb that switches between "all branch changes" and "uncommitted changes", unified/split toggle, hover-`+` line comments
- The side pane's Files section (`FilesPane`): lazily loaded worktree tree (gitignored entries dimmed), a filter box that fuzzy-matches file names or, with a leading `?`, searches contents, preview/pinned tabs persisted per agent, and a CodeMirror editor with Cmd+S save, Cmd+F search, folding, on-disk conflict handling, binary placeholder, image / video / audio previews streamed from the raw-file route, a right-click menu on tree rows (Download, Copy path), and hover-`+` line comments
- Unsaved editor buffers (`useFileBuffers`), owned by the workspace so drafts survive the pane remounting
- Syntax-highlighted unified/split diff for a single file (`DiffView`), with the inline comment composer
- Per-agent PR tab body (`AgentPRTab`): reviews / checks / merge status cards, merge actions, review threads, discussion list
- Diff theme resolver (light/dark to `vesper` / `github-light`)

## Public surface

- `DiffPane` — the Diff section of the agent side pane
- `FilesPane` — the Files section of the agent side pane
- `useFileBuffers` — unsaved-draft store for the Files section (and the `FileBuffers` type)
- `AgentPRTab` — per-agent PR tab body
- `DiffView` — single-file syntax-highlighted diff
- `getDiffTheme` — active pierre/diffs theme name; used by the workspace's worker pool provider

## Depends on

- `@huxflux/shared` — `Agent`, `FileChange`, `PRComment`, `PRCheck`, `PRThread`, `PRIssueComment`, `PRDetails`, `api`, `useRepos`
- `@huxflux/ui` — primitives (Button, ScrollArea, Popover, cn)
- `@pierre/diffs`, `@pierre/diffs/react` — diff parsing + `FileDiff` renderer, `resolveTheme` for tree theme styles
- `@codemirror/*`, `@lezer/highlight` — the Files section editor
- `@tanstack/react-virtual` — virtualised worktree tree
- `@tabler/icons-react` — icons
- `react-markdown`, `remark-gfm` — PR comment body rendering
- `sonner` — toast notifications for PR mutations
- `@tanstack/react-query` — file tree / diff / PR details fetching and invalidation
- `@/hooks/usePersistentState` — per-agent persisted pane state
- `@/lib/platform` — `handleExternalClick` for external PR links, `isTauri` for the desktop download path
- `@/lib/theme` — resolved theme used by `getDiffTheme`

## Sub-domains

None.

## Quirks

- `AgentPRTab` was named `PRView` originally; it was renamed to avoid colliding with the full-screen PR review page in `@/domains/pull-requests`.
- `DiffView` uses a manual `React.memo` comparator (path, preloaded diff, style, comment count) so the stacked diff does not re-render every file on unrelated parent renders. It has three `any` casts at the pierre/diffs boundary.
- The Diff and Files sections refetch when the agent's `fileChanges` signature changes (the watcher pushes it over WebSocket), instead of polling.
- Editor comment widgets are CodeMirror block widgets whose DOM nodes are handed to React through `PortalRegistry` (`components/files-pane/editor/commentExtensions.ts`), so the bubble and composer are ordinary React components.
- Downloads go through the raw-file route with the token in the query string. The browser saves via `Content-Disposition: attachment`; the desktop app calls the `download_file` Tauri command, which shows a save dialog and streams the file natively, because the webview does not handle `<a download>`.
- A file forced open with "View as text anyway" while binary is read-only, so a save cannot corrupt it.
- `useDiffTheme` is also implemented in chat on purpose; both share `getDiffTheme`.
- `stripHtml` in `utils.ts` uses `\x00CODE` placeholders to keep fenced code blocks; the function comment explains the ordering.
