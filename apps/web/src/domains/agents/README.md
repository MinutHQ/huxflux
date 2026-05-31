# agents

Agent orchestration surface: the per-agent workspace header above the chat, the per-agent terminal viewer (xterm.js, streamed from a server-side PTY), the sidebar's agent list with grouping / filtering / creation / archival, and the agent-centric home dashboard (lifetime stats, status breakdown, AI-generated "Wrapped" summaries) shown when no specific agent is selected.

## Owns

- The per-agent workspace header rendered above the chat: repo / agent name + task link, branch picker + base-branch picker, PR badges (review state, CI checks popover, PR number link), action buttons (Create PR, Review, Run), the "Open in editor" split-button (with SSH-aware behavior when running against a remote server) and the right-panel toggle
- The per-agent terminal viewer: persisted multi-tab strip backed by the server's terminal-tab table, long-lived xterm sessions kept in a module-level store so they survive component remounts, Cmd+F search, port autodetection, and the "setup" / "run" top-tab overlays
- The sidebar agent list: status-grouped or repo-grouped rows with thread-child nesting, inline rename, status context menu (set status, generate title, rename branch, delete with confirm), hover popover, repo + group-by filter, the new-agent flow (random bee names → branches) and add-workspace flows, plus the empty state
- The active-processes panel rendered at the bottom of the sidebar: lists every running dev-server port across all agents, click-through to open the URL or kill the process
- The home dashboard rendered when no agent is selected (and when the setup / teardown routes have no pending agent): rainbow wordmark with optional streak + achievement pills, four hero stat cards (worktrees / repos / messages / tool calls) with animated counters and an inline sparkline, token-usage and code-changes panels, a 30-day activity bar chart, status / repos breakdown panels, and the AI-generated "Wrapped" summary card. Backed by `api.getStats()` / `api.getWrapped()` and `useAgents` / `useRepos`. The full-viewport background composite (constellation canvas, aurora bands, drifting particles, four morphing blobs, mouse spotlight) is decorative and isolated in `HomeBackground`.

## Public surface

- `AgentWorkspaceHeader` — the per-agent header bar rendered above the chat
- `TerminalView` — the per-agent terminal viewer
- `AgentList` — the sidebar's agents pane: header bar (filter / add-workspace / new-agent), grouped agent rows, hover popover, dialogs, and lifecycle flows
- `ActiveProcesses` — the bottom-of-sidebar collapsible panel listing every running dev-server port across all agents
- `HomeView` — the agent-centric landing dashboard (lifetime workspace stats, status breakdown, AI "Wrapped" summary, animated background)
- `useAgentWorkspaceLayout` — layout + visibility state for the per-agent route (maximize toggle, right-panel + terminal visibility, Cmd/Ctrl+U / Cmd/Ctrl+J shortcuts, `useDefaultLayout` for both resizable groups)

## Depends on

- `@huxflux/shared` — `Agent`, `AgentSummary`, `AgentStatus`, `Repo`, `PRStatus`, `PRCheck`, `useAgents`, `useRepos`, `useAgentEvents`, `markAgentDeleted`, `statusConfig`, `api`, `WorkspaceStats`, `getActiveServer`
- `@huxflux/ui` — primitives (Button, ScrollArea, cn)
- `@tabler/icons-react` — icons
- `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links` — terminal renderer and addons
- `@tanstack/react-query` — PR details + repo-branches fetching, agent cache writes, ports query
- `@tanstack/react-router` — `useNavigate` / `useMatchRoute` for the Task link, selected-agent derivation, and active-processes click-through
- `sonner` — toast notifications for branch switch / open-in failures and copy-path success
- `react-dom` — `createPortal` for hover popovers, context menus, and floating dialogs
- `@/domains/settings` — `AddRepoDialog`, `CloneRepoDialog`, `QuickStartDialog` (opened from the add-workspace flow)
- `@/app-shell/workspace` — pending/deleting agent state shared with the chat surface
- `@/lib/flags` — `remoteEditor` flag
- `@/lib/platform` — `isTauri`, `handleExternalClick`
- `@/lib/colorThemes` — `colorThemes`, `getColorTheme` for the xterm theme

## Sub-domains

None.

## Quirks

- Terminal sessions live in a module-level `Map` (`globalSessions` in `terminalSession.ts`). They survive component unmount/remount (e.g. when the maximize toggle remounts the panel) and are only torn down explicitly when the user closes the tab. The wrapper `<div>` is re-attached via a ref callback so the existing xterm DOM node moves into the new wrapper.
- `useTerminalSession` carries two `// eslint-disable-next-line react-hooks/exhaustive-deps` comments: the activation effect intentionally re-runs only on `[activeTab, agentId, activeTerminalId, tabsLoaded]`, and the ResizeObserver effect intentionally runs once on mount. Both are load-bearing and preserved verbatim from the source.
- `ANSI_RE` in `config.ts` carries `// eslint-disable-next-line no-control-regex` because port autodetection has to strip ESC + BEL control bytes from terminal output before regex-matching.
- Terminal colors come from `@/lib/colorThemes` (which maps the active CSS-variable color theme to a concrete `terminal: { background, foreground, ... }` palette). xterm needs literal hex strings, not Tailwind classes; the theme switches live via the `huxflux:color-theme-change` window event.
- `useOpenInEditor` has `// eslint-disable-next-line react-hooks/exhaustive-deps` on the ⌘O keyboard-shortcut effect: the dep list is the exact set referenced inside `doOpenIn` (`agentId`, `lastApp`, `remoteMode`, `sshInfo`) and adding others would re-bind the listener for no reason. Preserved from the source.
- `BranchPicker` is generic and used twice in `BranchRow` (current branch + base branch); on the source file these were two near-identical inline blocks. The pick handler is async so callers can `await api.switchBranch(...)`; the picker closes itself synchronously before awaiting so the popover doesn't linger.
- The header's `Run` button on the source file dispatched the `huxflux:run-script` window event from the route; nothing changed here. The route still owns the event and `TerminalView` doesn't subscribe — the route forwards via its own listener.
- Remote-mode open-in (Tauri + non-localhost active server) detects installed editors via `tauri invoke("detect_editors")` and falls back to clipboard `code --remote ssh-remote+host /path` on the web build. SSH info comes from `api.getSystemSshInfo()`.
- `closeTerminalSession` deliberately closes the websocket via try/catch — readyState may be transitional and `close()` can throw if called too early. The same pattern was in the source.
- The hover popover's branded "backlog" pill swapped the legacy `bg-zinc-500/10 border-zinc-500/25 text-zinc-400` classes for design-system tokens (`bg-muted/40 border-border text-muted-foreground`). The other status pill colors (amber/blue/emerald/red) are intentional semantic accents and stay.
- `StatusContextMenu`'s position effect runs once on mount with `[]` and carries `// eslint-disable-next-line react-hooks/exhaustive-deps` — the `x`/`y` arguments are the initial click coordinates and never change while the menu is open.
- `useAgentLifecycle` writes to `["agents"]` with prefix matching because the source-of-truth cache key from `useAgents` is `["agents", serverUrl]`. An exact key would silently miss; the WS event reconciles afterwards.
- localStorage keys for groupBy and repoFilter use the legacy `hive:` prefix (not `huxflux:`) so users don't lose their stored settings after the project rename.
- `useAnimatedNumber` (under `hooks/`) intentionally excludes `value` from its effect deps and carries an `// eslint-disable-next-line react-hooks/exhaustive-deps`. The state `value` is the *current* displayed number, captured into a ref as the start point for the next animation when `target` or `duration` change — including it in deps would restart the animation on every tick and never settle.
- `useWrappedSummary`'s auto-fetch effect lists only `[period, length, fetchWrapped]` and carries `// eslint-disable-next-line react-hooks/exhaustive-deps`. The `customFrom` / `customTo` inputs feed an explicit Generate button instead of auto-firing, otherwise every keystroke in the date input would trigger an LLM call.
- The home dashboard uses semantic accent colors directly (`text-emerald-400`, `text-blue-400`, `text-violet-400`, `text-orange-400`, etc.) — these are *not* the forbidden `zinc/slate/gray` palette and are intentional decorative accents on the lifetime-stats card hover states + the rainbow wordmark / streak / achievement pills. No `zinc`-class swaps were needed; the source already avoided them.
- `ConstellationBackground` keeps its node array, mouse position and RAF handle in refs so the animation never re-renders. The canvas resizes via a `resize` listener and clears + redraws every frame; nodes are initialised once and persist across renders (cleanup cancels the RAF and removes listeners, but the ref content survives if the component is re-mounted while the module stays loaded — currently it does not, since `HomeView` is route-mounted).
- `RepoPanel`'s small per-repo bar-preview heights are randomised but memoised via `useMemo([repos, agents])` so each repo gets a stable randomised silhouette instead of jittering on every render (the source called `Math.random()` directly inside the JSX, which would have re-rolled every render).
- The home dashboard keyframes (`homeFloat`, `homeMorph`, `homeGlow`, `homeOrbit`, `homeAurora1/2/3`, `homeRainbow`, `homeBorderRotate`, `homeShimmer`, `homeSlotSpin`) and the `.home-shimmer` utility class live in `apps/web/src/index.css`. They were left in place — moving them into a CSS-in-JS file would not buy anything and they're loaded once globally regardless.
