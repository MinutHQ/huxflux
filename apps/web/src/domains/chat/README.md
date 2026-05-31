# chat

The agent chat view. Renders the conversation between the user and a Huxflux agent: message list (user + assistant turns with tool calls, thinking, diff summaries, todos, team agents), composer with model/effort/plan controls, @mention and slash command pickers, file/PR/diff-browser tabs, branch + open-in toolbar. Also owns the lightweight setup and teardown placeholder views shown while a worktree is being created or removed.

## Owns

- The main chat view component used by the agent route and embedded by `TasksView`
- Message rendering (user bubbles, assistant bubbles, system events, thinking, tool calls, turn diff summary, PR cards)
- Composer (input, attachments, mentions, slash commands, model picker, plan mode, effort, queued messages)
- Top metadata bar (repo / branch / base branch / PR status / open-in)
- Tab bar (multi-agent tabs, file / diff-browser / PR tabs)
- Team agent and thread agent bars, Tasks bar, ContextRing, AskUserQuestion card
- Setup view shown while a worktree is being scaffolded
- Teardown view shown while a worktree is being deleted

## Public surface

- `ChatView` — the main agent conversation view (used by `routes/_app/agent.$agentId.tsx` and the `@/domains/tasks` task chat panel)
- `SetupView` — placeholder shown by `routes/_app/agent.setup.tsx` while a worktree is created
- `TeardownView` — placeholder shown by `routes/_app/agent.teardown.tsx` while a worktree is removed

## Depends on

- `@huxflux/shared` — `Agent`, `Message`, `ToolCall`, `PRStatus`, `PRComment`, `FileChange`, `AgentSummary`, `SlashCommand`, `useAgents`, `useRepos`, `isAgentStreaming`, `api`, `getActiveServer`
- `@huxflux/ui` — primitives (Button, Popover, Select, cn)
- `@tabler/icons-react` — icons
- `@pierre/diffs` and `@pierre/diffs/react` — inline file diff rendering inside `TurnDiffSummary`
- `react-markdown`, `remark-gfm`, `remark-breaks` — markdown rendering
- `sonner` — toast notifications
- `@/domains/file-changes` — provides `DiffView`, `FileContentView`, `StackedDiffView`, `AgentPRTab` (rendered when the user switches to the file / diff-browser / PR tab), and `getDiffTheme` (consumed by `useDiffTheme`).
- `@/app-shell/workspace` — `OpenFile`, `ChatTab` types from the workspace context
- `@/lib/platform`, `@/lib/flags`, `@/lib/notificationPrefs` — platform detection, feature flags, and send-key / strip-youre-right / auto-convert preferences

## Sub-domains

None. Components, hooks, view shells, and pure helpers are all flat inside `components/`, `views/`, `hooks/`, and `extract/`.

## Quirks

- `ChatView` keeps per-agent state (input draft, plan mode, linked agents, attachments) in `useAgentStateCache` keyed by agent id, so switching tabs restores the right composer state. The hook flushes the outgoing agent's draft to the server before swapping.
- `useChatSend` is the single owner of `isSending` + `messageQueue`. Sending while streaming pushes onto the queue; `isAgentStreaming(agent)` driven from the server's websocket flag drains it. `isSending` deliberately stays true for a beat after `api.sendMessage` resolves so the spinner doesn't flicker.
- `useChatScroll` uses a callback ref (`setScrollContainer`) instead of `useEffect([])` because the scroll container is conditionally rendered — an effect would miss the initial mount.
- The `ToolCallRow` `Agent` branch recurses into itself for sub-agent tool calls. Streaming guard: a tool call is only "running" while the parent message is still streaming AND no result has come back yet. Without that guard, legacy rows with no result would spin forever.
- `extractTeamAgents` only looks at the last assistant message that has `Agent` tool calls so a new team supersedes the previous one. It also folds in `SendMessage` tool calls targeting each named agent.
- `TeamAgentBar` and `TasksBar` persist user dismissal in localStorage keyed by agent id. `TeamAgentBar` re-shows itself when a new agent id appears so a fresh team after a dismiss isn't silently hidden.
- The "Draft PR open" pill uses muted design-system tokens, not the original hardcoded zinc classes, because the domain-level no-restricted-syntax rule forbids zinc/slate/gray scales.
- `CreationView` animates 120 particles via a single `requestAnimationFrame` loop that reads the latest mouse position from a ref, so the React tree only re-renders on click (for flying-symbol bursts) rather than every frame.
- `useAgentStateCache` uses `eslint-disable react-hooks/exhaustive-deps` because the effect should run only when the agent id changes; including the cached state setters would loop.
- The mention/slash dropdowns are positioned `absolute` above the composer textarea; the `MentionPicker` and `SlashCommandPicker` components return `null` when their respective query is null rather than being conditionally rendered by the parent, so the input bar stays simple.
