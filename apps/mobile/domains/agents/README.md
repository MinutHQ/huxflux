# agents

Mobile agent orchestration surface: the agent list (home tab), the per-agent chat/files/PR/terminal detail screen, the new-agent creation flow with the animated setup overlay, the lifetime workspace dashboard, and the file/diff/file-content viewers reachable from a single agent. Backed cross-platform by `@huxflux/shared`'s agents slice; the screens compose RN primitives directly (no DOM, no `@huxflux/ui` web-only primitives).

## Owns

- The home tab agent list: server selector with status pill, repo filter, status / repo grouping with collapsible sections, per-row long-press actions (rename / change status / delete) and PR badges, the swipe-to-refresh + WS-driven liveness indicator
- The lifetime workspace dashboard tab: animated hero counters (worktrees / repos / messages / tool calls), token and code-change panels, 30-day activity bar chart, status + repos breakdown, ambient particle / glow background
- The per-agent detail screen: sub-session strip, sub-nav (Chat / Files / PR / Terminal), the chat feed with markdown-ish message bubbles, thinking blocks, tool-call rows / lists with the team-agent bar for sub-agent calls, the input bar with model / thinking / plan toggles + image attachments + queued-while-streaming behavior, and the xterm-via-WebView terminal pane
- The agent files screen (consumable as a route or as the inline files pane of the detail screen): tabbed Changes / All Files view with inline unified-diff rendering, expand-all toggle, file tree navigation
- The file-content and diff route screens: single-file syntax-highlighted content viewer, single-file unified-diff viewer
- The new-agent creation flow: worktree / direct toggle, repo picker, random "bee" name + branch generation, the animated setup overlay (typewriter title, expanding rings, orbiting dots, particles, step progression, progress bar) and the queued-first-message that the chat screen consumes via `lib/setupMessage`
- The mobile Markdown renderer used by chat output, sub-agent output, and the PR comment components in `domains/pull-requests/` — re-exported from this domain's index so it can move into `apps/mobile/ui/` (the shared mobile-primitives location) without breaking imports

## Public surface

- `AgentListScreen` — the home-tab screen rendered by `app/(tabs)/index.tsx`
- `AgentDashboardScreen` — the dashboard-tab screen rendered by `app/(tabs)/dashboard.tsx`
- `AgentDetailScreen` — the per-agent chat / files / PR / terminal screen rendered by `app/agent/[id]/index.tsx`
- `AgentFilesScreen` — the per-agent files screen (route + inline pane of `AgentDetailScreen`)
- `FileContentScreen` — single-file content viewer rendered by `app/agent/[id]/file-content.tsx`
- `DiffScreen` — single-file diff viewer rendered by `app/agent/[id]/diff.tsx`
- `NewAgentScreen` — the new-agent creation modal rendered by `app/new-agent.tsx`
- `Markdown` — RN-based markdown renderer (re-exported for the PR comment components in `@/domains/pull-requests`; will move to `@/ui` if a third consumer appears)

## Depends on

- `@huxflux/shared` — `useAgent`, `useAgents`, `useRepos`, `useServerStatus`, `useWsConnected`, `api`, `markAgentDeleted`, `statusConfig`, `getActiveServer`, `getServers`, `setActiveServerId`, `getStorage`, `parseUnifiedDiff`, `tokenize`, types (`Agent`, `AgentSummary`, `AgentStatus`, `Message`, `ToolCall`, `FileChange`, `DiffLine`, `Repo`, `WorkspaceStats`)
- `@huxflux/tokens` — via `apps/mobile/theme.ts` (`c`, `statusColors`, `prColors`, etc.)
- `@expo/vector-icons` — `Ionicons` across the surface
- `react-native` — primitives (`View`, `Text`, `FlatList`, `ScrollView`, `Pressable`, `Animated`, etc.)
- `react-native-webview` — `WebView` hosting the xterm.js terminal
- `react-native-safe-area-context` — `useSafeAreaInsets`
- `@shopify/flash-list` — `FlashList` for the new-agent repo picker, file-content lines, and diff lines
- `@tanstack/react-query` — agent / sessions / diff / file-tree / file-content / terminal-tabs queries plus optimistic message-send cache writes
- `expo-router` — `useRouter`, `useLocalSearchParams`, `useFocusEffect` (used inside the domain hooks; the route files at `app/` are the entry points)
- `expo-image-picker`, `expo-file-system` — chat image attachments
- `@/theme` — `c`, `statusColors`, `prColors` (mobile theme tokens)
- `@/ui` — `useModal` for action sheets / confirms / prompts / alerts
- `@/app/_layout` — `useHydrated` for storage hydration gating
- `@/lib/prefs` — `prefs`, `COLLAPSED_SECTIONS_KEY`, `REPO_FILTER_KEY`, `GROUP_BY_KEY`
- `@/lib/setupMessage` — `setSetupMessage` / `consumeSetupMessage` hand-off between the new-agent flow and the chat screen

## Sub-domains

None.

## Quirks

- **Expo Router boundary.** Route files live in `apps/mobile/app/` (filesystem-routed) and stay thin — each route imports the matching screen from this domain's `index.ts` and renders it. `useLocalSearchParams` is consumed in the route file and passed to the screen as props (e.g. `<AgentDetailScreen agentId={id} prPaneSlot={…} />`).
- **The PR pane slot.** `AgentDetailScreen` accepts a `prPaneSlot: ReactNode` prop so the route renders the PR pane (`AgentPRPane` from `@/domains/pull-requests`) without this domain importing the pull-requests domain. The route at `app/agent/[id]/index.tsx` constructs `<AgentPRPane agentId={id} />` and passes it through. Removing the slot indirection (having `AgentDetailScreen` import `AgentPRPane` directly from `@/domains/pull-requests`) is reasonable now that the pull-requests domain exists; preserved as a slot in this commit to avoid widening the diff.
- **Markdown re-export.** `Markdown` is exported from this domain's index so the pull-requests domain's PR comment components (`ThreadCard`, `IssueCommentCard`, `ReviewCommentCard`, `PRChatBubble`) can use it via `@/domains/agents`. The cross-domain import exists because the agents domain owns the only RN markdown renderer in the app. Long-term, `Markdown` should move into `@/ui` (the shared mobile-primitives location); for now it stays here because the agents surfaces remain the primary consumer.
- **Theme `c.accent` is undefined.** The dashboard uses `c.accent` in three places (the activity indicators and the repo-panel folder icon). `theme.ts` does not define this key, so it resolves to `undefined` at runtime, which `Ionicons`/`ActivityIndicator` treat as the default color. This is a pre-existing bug from the source; preserved verbatim and cast to `(c as any).accent` in the new files to keep the surface identical. Fix when the mobile theme is properly typed.
- **`DiffLineRow` is duplicated.** This domain has its own `components/DiffLineRow.tsx` for `AgentFilesScreen` + `DiffScreen`. The pull-requests domain has an identical copy at `domains/pull-requests/components/DiffLineRow.tsx` for `PRDiffScreen`. Consolidating both into `apps/mobile/ui/` (the shared mobile-primitives location) is the follow-up; YAGNI until a third consumer appears.
- **Setup-message hand-off across screens.** `lib/setupMessage` is a module-level `let _pending` consumed once on the chat screen mount. `NewAgentScreen` writes via `setSetupMessage`, navigates to the agent route, then `useAgentChat`'s `useChatSend` effect calls `consumeSetupMessage()` and dispatches the first message. The same module is also written via `setSetupMessage(null)` to clear on failure / reset.
- **Streaming auto-scroll trigger.** `AgentDetailScreen` re-runs its scroll-to-end effect on `[messages.length, streamingContentLen, streamingToolCallsLen, streamingPendingLen, isStreaming]` so the feed stays pinned to the bottom while a message is streaming (content / tool calls / pending text grow incrementally). The `isAtBottom` ref blocks the auto-scroll when the user has scrolled up.
- **Optimistic send pattern.** `useChatSend.doSend` writes an `optimistic-${Date.now()}` message into the `["agent", id]` cache before awaiting `api.sendMessage`, and rolls it back on failure. The WS `message:updated` event from the server then replaces it with the real message. Same pattern as the web domain.
- **Tool-calls list auto-collapse.** `ToolCallsList` opens when `isStreaming` flips true and collapses when streaming ends, unless the user has manually toggled it — then the user toggle wins for the rest of the message's lifetime. Preserved from the source.
- **`SessionsStrip` cache pre-fill.** Tapping a child-session tab calls `queryClient.setQueryData(["agent", s.id], …)` with a stub `Agent` (the summary plus empty `messages`/`fileChanges`/`terminalOutput`) if no cache exists yet, so `useAgent` has something to render while the real fetch lands. Preserved from the source.
- **Animation hooks carry `eslint-disable-next-line react-hooks/exhaustive-deps`.** `useAnimatedNumber`, `useStagger`, `useBarFill`, `usePulse`, and `useSetupAnimations` intentionally omit some deps (e.g. `value`, `target`, refs from `useRef`) because including them would re-trigger animations on every render. Preserved verbatim.
- **`StreamingDots` mount-only deps.** Same pattern: the animation parallel-loop kicks off once on mount and never re-runs. The cleanup stops all animations.
- **xterm via WebView.** `TerminalPane` builds an HTML page that loads xterm.js from a CDN, opens a WebSocket to the server's `/ws/pty/{agentId}` endpoint, and forwards keystrokes. The `key={wsUrl}` on the `WebView` forces a fresh DOM when the URL changes (e.g. switching terminal tabs), which is intentional because we don't have a way to send tab-switch messages into the in-WebView terminal.
- **`extractTeamAgents` walks backward.** The function scans messages from the latest to the first looking for an assistant message with `Agent` tool calls — only the most recent batch is shown in the team bar. This matches the source's behavior; older batches are intentionally hidden once a new assistant turn lands.
- **`SETUP_STEPS` is small but its display is staggered.** The setup overlay shows steps appearing every ~540ms (3000ms budget × 0.9 / 5 steps), with the previous step marking done 65% into the next step's interval. The intent is "visible activity without dragging the user out of flow"; the timing is preserved.
- **`buildContent` prepends an attached-files block.** If attachments are present, the user's message is wrapped with `Attached files:\n- name: path\n\n---\n\n{text}`. This is the same format as web — the model parses it the same way.
