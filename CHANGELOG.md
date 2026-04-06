# Changelog

## Unreleased

### Mobile

- Simplified new-agent flow to single step — tap a repo to instantly create an agent (auto-generates bee name and branch, no manual input required)
- Replaced native action sheets and alerts with a custom bottom sheet component
- Removed purple/indigo accent color — UI now uses stone-based colors consistent with the web app
- Fixed `KeyboardAvoidingView` crash (switched from `react-native-keyboard-controller` to built-in RN component)

### Desktop

- Auto-update support — app checks for updates on launch and shows a dismissible banner with one-click install and progress indicator
- Frameless window with custom traffic light buttons (close/minimize/maximize)
- Multiple terminals per agent — open and switch between terminal sessions with a tab bar
- Local release script (`scripts/release-desktop.sh`) builds signed macOS ARM + Intel DMGs and publishes to `AlexMartosP/huxflux-releases`

### Web

- Streaming indicator now restores correctly when navigating back to an agent that is still running
- Sidebar is now resizable (12–28% width) and collapsible via `⌘B` or the chevron button
- Long agent titles in sidebar now ellipsis correctly instead of overflowing
- "Mark ready for review" button in PR tab to convert draft PRs (uses GitHub GraphQL API)
- Streaming indicator now correctly resets when switching between agents
- Loading indicator clears correctly after Claude finishes, even after a WS reconnect
- **@ mentions in chat** — type `@` to search and attach worktree files inline or insert terminal output as context; file references render with accent color in sent messages; hover suggestions show a line-numbered preview panel
- **Tasks bar** — reads Claude's `TodoWrite` tool calls and shows a collapsible task list above the chat input with per-task status (pending / active / completed)
- **Markdown tables** — tables now render with styled rows and a copy button that exports pipe-formatted markdown for pasting into any markdown editor
- Team agents and Tasks panels are now inset cards above the input box instead of full-width divider panels
- Removed the border dividing the message list from the chat input area

### Server

- Each chat tab now resumes its own Claude session via `--resume <sessionId>`, preventing tabs from sharing conversation context
- Added `session_id` column to agents table (migration v7)
- Added `PUT` to CORS methods (required for mark-ready endpoint)
- Added support for local-only repos (no remote) — branch detection falls back to local HEAD
- Fixed "fatal: invalid reference" when creating a worktree on a repo with no commits yet
- Added `POST /api/repos/clone` — clone a remote repository by URL
- Added `POST /api/repos/quick-start` — scaffold a new Vite or TanStack Start project with git initialized

---

## 0.2.3 — 2026-04-01

### Server

- Replaced `better-sqlite3` native addon with Node.js built-in `node:sqlite` — no more native bindings, works on any Node 22.5+ install without recompiling
- Fixed agent creation and all DB queries returning `undefined` (drizzle async/sync adapter mismatch)
- Fixed poller `rows is not iterable` error
- Dev mode now uses port 3002 to avoid conflicting with a running prod server
- `huxflux open` now opens the hosted web app at `https://huxflux.netlify.app`

### Web

- Repo name shown in ChatView header alongside branch
- Fixed infinite render loop in workspace tab sync (`useWorkspace`)
- Web app now auto-connects when opened via `huxflux open` (`?connect=` URL param)
- Hosted separately on Netlify — server npm package no longer bundles the web UI

---

## 2026-04-01

### Mobile App (Expo)
- New `apps/mobile` — Expo app for iOS and Android using Expo Router and React Query
- Connect to any running Hive server by entering its URL (supports `huxflux://` connection strings with embedded tokens)
- Agent list screen: agents grouped by status with live WebSocket updates and unread badges
- Chat screen: full message thread with streaming, tool call indicators, and optimistic sends
- File changes list with additions/deletions per file
- Diff viewer: unified diff with syntax highlighting, powered by shared parsing logic
- PR status screen: reviews, CI checks, "Mark ready" and "Re-request review" actions
- Create agent wizard: two-step flow — pick repo, set title/branch/model
- Persistent storage via AsyncStorage with synchronous in-memory cache for instant reads

### Shared Package (`@hive/shared`)
- New `packages/shared` workspace package extracted from web app
- Contains all shared types, API client, WebSocket client, React Query hooks, diff parser, and server store
- Platform-agnostic storage via injectable `StorageAdapter` interface — web uses `localStorage`, mobile uses AsyncStorage
- `configureAgentErrorHandler` lets each platform handle errors natively (toast on web, `Alert` on mobile)
- Diff logic (`parseUnifiedDiff`, `tokenize`) extracted as pure functions — no React dependency

### Web
- Web imports (`data/mock.ts`, `lib/api.ts`, `lib/ws.ts`, `lib/serverStore.ts`, all hooks) now re-export from `@hive/shared`

### PR Review
- "Re-request review" button now appears for dismissed approvals in addition to change requests

### Base Branch
- Base branch selector in ChatView replaced with a searchable dropdown populated from the repo's GitHub branches

## 2026-03-31

### GitHub PR Integration
- Auto-detect PRs created for an agent's branch via background polling (every 60s, initial check after 5s)
- Sync agent status from PR state: draft → in-progress, open → in-review, merged → done, closed → cancelled
- PR status pill in ChatView header: shows PR number (links to GitHub), status badge, and action buttons
- "Mark ready" button on draft PRs to promote to ready for review
- "Re-request review" button when changes requested or review dismissed — available in both header pill and PR tab
- SSH URL alias support for GitHub remotes (e.g. `git@gh_alias:owner/repo`)

### Pull Request Tab
- New "Pull request" tab in the file changes panel when an agent has a PR
- Shows PR title, number, author, status banner, reviews with avatars and states, CI checks with pass/fail icons
- Review threads displayed with resolved/outdated indicators, replies indented with ↳ marker
- "Add to chat" on unresolved thread comments — adds comment as chip in the input area
- General PR discussion comments (issue comments) shown below threads

### Chat Improvements
- Write follow-up messages while agent is streaming — message is queued and auto-sent when streaming finishes
- Queued message indicator shows above input with option to cancel
- "Working…" indicator removed from header — the typing bubble in chat already conveys this
- Rename agent directly in the ChatView tab bar — pencil icon appears on hover
- Click the base branch in the header to change it per-agent (overrides repo default)

### Repo & Agent Configuration
- Branch prefix configurable per repo in Settings → repo settings (e.g. `minut-alexander/`)
- New agents use the repo's branch prefix instead of the hardcoded `agent/` prefix
- Per-agent base branch override — changes which branch a PR targets
- Worktrees now branch from the configured remote tracking branch (e.g. `origin/main`) instead of local HEAD

### Status Fixes
- Agent stays `in-review` when a follow-up message is sent — no longer downgraded to `in-progress`

### Other
- Port conflict handling: server tries ports 4321–4330 on startup
- Stop agent button kills the running Claude subprocess via SIGTERM
- "Add repo" button in the sidebar now opens the add-repository dialog directly
- Repository search excludes system folders, package manager caches, build output, and virtual envs
- API errors now surface the server's error message in toasts instead of just the HTTP status
