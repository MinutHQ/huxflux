# Changelog

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
- Port conflict handling: server tries ports 3001–3010 on startup
- Stop agent button kills the running Claude subprocess via SIGTERM
- "Add repo" button in the sidebar now opens the add-repository dialog directly
- Repository search excludes system folders, package manager caches, build output, and virtual envs
- API errors now surface the server's error message in toasts instead of just the HTTP status
