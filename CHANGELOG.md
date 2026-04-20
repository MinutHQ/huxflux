# Changelog

## 0.2.22 — 2026-04-20

### Web — Workspace Redesign

- **TanStack Router migration** — URL-driven navigation replaces state-based routing; hash routing for Tauri desktop, browser history for web
- **Full-width workspace header** — agent name + repo above branch pickers, PR status badges with CI popover, run button, open-in editor split button (icon + dropdown), panel toggle (⌘U)
- **Sidebar depth effect** — sidebar appears below main content with rounded card + shadow styling
- **Right panels as cards** — files and terminal in separate rounded containers
- **Pill-style chat tabs** — gradient fade background, `bg-accent` active state
- **Unified file view** — All/Diff/PR tabs with file search, stacked diff mode with virtualization (`@tanstack/react-virtual`), web worker offloading (`@pierre/diffs/worker`), lazy mount/unmount via IntersectionObserver
- **PR tab redesign** — GitHub-style stacked status cards (reviews, checks, merge status), merge button group (squash/merge/rebase), bypass rules checkbox, reply/resolve individual threads, markdown-rendered comments, HTML stripping
- **Dynamic diff theme** — vesper (dark) / github-light (light) based on app theme
- **Settings routes** — `/settings/general`, `/settings/appearance`, `/settings/repo/$repoId`, etc.
- **Cmd+K search** — paste GitHub PR URL or type `#123` to find agent by PR
- **Keyboard shortcuts** — ⌘U toggle right panel, ⌘J toggle terminal

### Web — Processes & Ports

- **Active processes panel** in sidebar — pulsing green dot, port links, agent navigation, kill button
- **Auto-kill on done** — setting to SIGTERM all processes in a worktree when agent marked done/cancelled
- `GET /api/ports` — all listening ports across active agents
- `POST /api/agents/:id/kill-processes` — stop processes in a worktree

### Web — Other

- **Worktree pool** — pre-create worktrees for instant agent start (setting per repo); pooled agents appear as backlog in sidebar; auto-replenish after claim
- **Review settings** — select provider + model for AI code reviews
- **Tasks bar** — stays dismissed permanently, only shows while agent is actively working
- **Close tab confirmation** — popover confirm on child tab close, deletes agent from server
- **Plan approval fix** — persists until user explicitly approves/dismisses
- **Fetch aborted toasts suppressed** during navigation
- **Streaming indicator sync** — sidebar clears at same time as chat via `message:done` event
- Removed button bounce (`translate-y-px`)
- Removed setup/run tabs from terminal

### Server

- **Delegate tags fire during streaming** — `<huxflux:delegate>` tags execute immediately when complete, not after full response
- **Worktree pool** — `pool_size` on repos, background replenishment, setup script pre-run
- **Child agent safety** — deleting child agents no longer removes shared worktree
- **Git watcher guard** — checks `fs.existsSync` before `simpleGit` to prevent crash on deleted worktrees
- **Setup script env vars** — `$HUXFLUX_WORKTREE`, `$HUXFLUX_REPO`, `$HUXFLUX_AGENT_ID` available in setup scripts, CLI agent, and terminal PTY
- **`.huxflux_attachments` excluded** via `.git/info/exclude` (local-only, not committed)
- **Streaming as single source of truth** — removed in-memory override, DB `streaming` column is canonical
- Auto-kill processes on agent done/cancelled (setting-controlled)
- `GET /api/agents/:id/ports` — listening ports for an agent
- `poolSize` persisted in repo update endpoint

### Desktop

- Fixed dev mode banner showing in production builds (`NODE_ENV=production` in `beforeBuildCommand`)
- Auto-bump `tauri.conf.json` version in release script
- Version without `v` prefix in updater `latest.json`
- Toast error on failed update download/relaunch, manual restart fallback

### Mobile

- Simplified new-agent flow to single step — tap a repo to instantly create an agent (auto-generates bee name and branch, no manual input required)
- Replaced native action sheets and alerts with a custom bottom sheet component
- Removed purple/indigo accent color — UI now uses stone-based colors consistent with the web app
- Fixed `KeyboardAvoidingView` crash (switched from `react-native-keyboard-controller` to built-in RN component)

## Unreleased

### Server

- `huxflux reset` — destructive command to wipe the database and all git worktrees for a clean slate; requires three confirmations (`y` → `"yes"` → `"huxflux"`) and stops immediately on any wrong answer
- `GET /api/system/ssh-info` — returns SSH connection details (host, port, user, configured) for remote editor launch; configure via `HUXFLUX_SSH_HOST` / `HUXFLUX_SSH_USER` env vars
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
