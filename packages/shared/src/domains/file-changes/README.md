# file-changes

Cross-platform types and pure logic behind the diff pane and the file browser on web and mobile. No HTTP here: the endpoints (`listDirectory`, `filePaths`, `searchFiles`, `readFile`, `allDiffs`) live in the agents api slice because they are agent-scoped routes.

## Owns

- Building the changed-files folder tree (with per-folder +/- totals and compacted single-child folder chains) and flattening it into rows
- Ordering a list of changed files the same way the tree shows them, so a stacked diff and its tree agree
- Fuzzy path matching for the file browser's name filter
- Grouping content-search hits by file
- Deciding which files preview as image, video or audio, and their MIME types

## Public surface

- `file-changes.types.ts`: `diffBaseSchema` / `DiffBase` (`branch` vs `uncommitted`), `directoryEntrySchema` / `DirectoryEntry`, `fileSearchMatchSchema` / `FileSearchMatch`, `fileReadResultSchema` / `FileReadResult`
- `file-changes.state.ts`:
  - `buildChangedFileTree` / `flattenChangedTree` and the `ChangedTreeNode`, `ChangedFileNode`, `ChangedDirNode`, `TreeRow` types: the diff pane's left column
  - `orderChangedFiles`: changed files in tree order
  - `matchPath` / `fuzzyFilterPaths` and `PathMatch`: name filter scoring with match indices for highlighting
  - `groupSearchMatches` and `SearchMatchGroup`: content-search results grouped per file
  - `ancestorDirs`: every parent folder of a path, used to reveal a file in a lazy tree
  - `buildLineCommentsBlock`: prefixes a chat message with pending line comments (`path:line` plus quoted body), shared by web and mobile
- `mediaType.ts`: `getMediaType` and the `MediaKind` / `MediaType` types: extension to media kind and MIME, used by the server's raw-file route and the web viewer

## Depends on

- `../agents/agents.types`: `FileChange`
- `../pull-requests/pull-requests.types`: `PRComment`

## Sub-domains

None.

## Quirks

- `matchPath` tries a match anchored inside the file name before falling back to the whole path, so `idx` prefers `src/index.ts` over a folder called `idx`.
