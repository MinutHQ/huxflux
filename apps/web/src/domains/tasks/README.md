# tasks

Task management surfaces in the web app: the kanban-style tasks board, a
right-side task detail sheet with embedded refine chat, and the sidebar
refine list pane that lists local refinement sessions. The tasks domain
owns the route-rendered `TasksView` (board + detail sheet) at `/tasks` and
`/tasks/$taskId`, the route-rendered `RefineView` at `/refine/$sessionId`,
and the sidebar's Refine tab content.

## Owns

- Kanban-style tasks board with drag-and-drop status transitions (column
  reorder writes through to the server and, when the task has a Jira key, also
  pushes a Jira transition).
- Drag-to-in-progress intercept: dropping an un-agented task on the
  in-progress column opens the start-work picker rather than silently
  moving the card.
- Start-work picker: a dialog (repo + model + provider) that confirms the
  agent spawn. The repo is persisted onto the task before calling
  `startWork`; model / provider are stored locally for now because the
  server-side endpoint derives them from the task row itself.
- Right-side task detail sheet (Jira link, breadcrumb stack-navigation,
  delete-via-popover, properties panel, description, subtasks, linked
  agents). The sheet also surfaces a floating "Ask AI" bubble that opens
  an in-sheet refine chat panel.
- Floating "Ask AI" bubble on the board (composer wired as a stub until
  the board-level AI surface is built out).
- New-task dialog (status + repo picker) and the "Sync from Jira" button
  on the board toolbar.
- Per-task refinement flow (the route-level `RefineView`): scripted
  conversation pane that asks repo selection, then three refinement questions,
  then assembles a spec; spec panel that lets the user edit goal / notes /
  acceptance criteria and add/remove subtasks.
- Refine session persistence (localStorage), including
  `loadRefineSessions` / `saveRefineSessions` consumed by the route layer.
- Sidebar `RefinePane` — list of saved refinement sessions plus a "new
  refinement" CTA.

## Public surface

- `TasksView` — kanban board, route-rendered at `/tasks` and `/tasks/$taskId`.
  Accepts optional `initialTaskId` to open straight into the detail sheet.
- `RefineView` — per-session refinement screen, route-rendered at
  `/refine/$sessionId`.
- `RefinePane` — sidebar tab pane that lists saved refinement sessions and
  exposes a "new refinement" entry point.
- `loadRefineSessions` — read all refinement sessions from localStorage.
- `saveRefineSessions` — persist refinement sessions to localStorage.
- `RefineSession` — type of a single refinement session.
- `RefineMessage` — type of a message inside a refinement conversation.
- `RefineSubtask` — type of a subtask attached to a refinement session.

## Depends on

- `@huxflux/shared` — `api`, `useAgent`, `useAgentEvents`, `useRepos`,
  `TaskItem`, `Repo`.
- `@huxflux/ui` — `Button`, `ScrollArea`, `Select*`, `ResizablePanel*`, `cn`.
- `@tabler/icons-react` — every icon.
- `@dnd-kit/core` — kanban drag-and-drop.
- `@tanstack/react-query` — server cache (tasks list, settings, repos).
- `@tanstack/react-router` — `useNavigate`, `useMatchRoute` for sidebar
  selection state.
- `react-markdown`, `remark-gfm`, `remark-breaks` — task description and
  refine-chat markdown rendering.
- `sonner` — toast notifications (lazy-imported only when an error fires).
- `@/domains/chat` — `ChatView`, embedded inside the per-task chat panel once
  a refine agent exists.
- `@/lib/platform` — `handleExternalClick` for Jira deep links.

## Sub-domains

None. Components are organised into three folders inside `components/` to keep
file counts manageable: `board/` (kanban list + cards + new-task dialog +
start-work picker + Ask-AI bubble), `full-view/` (the detail-sheet content,
shared with the legacy route-level full-view that no longer exists), and
`refine/` (the conversation + spec panels). Hooks live flat under `hooks/`.

## Quirks

- The Jira host is fetched via the settings query and falls back to
  `jira.atlassian.net` only as a literal string fallback — this surfaces a
  broken link rather than crashing when Jira isn't configured.
- The refine-conversation script is scripted (`REFINE_QUESTIONS` in
  `config.ts`) and uses `setTimeout` to fake a "typing" pause; the simulated
  agent is stateless and derives the next step purely from
  `session.answers.length`.
- `useTaskFullView` keeps a `stackIds` breadcrumb of nested task ids; updates
  apply via `applyNestedUpdate` which rebuilds the root task from the bottom
  of the stack so subtask edits propagate correctly through the cache. The
  consumer mounts `<TaskDetailSheet key={selectedTask.id} ...>` so navigating
  between root tasks remounts and resets the breadcrumb; the hook does not
  mirror `task.id` into a `useEffect` (cascading-render rule).
- For the same reason `TaskTitle`, `TaskDescription`, and `TaskChatPanel` each
  delegate to an inner editor mounted with `key={item.id}` — the prop-mirror
  effects that were in the legacy component now happen via remount.
- `useTasksBoard` subscribes to `task:comment` and `task:updated` WS events
  and invalidates the tasks query, so the kanban stays in sync when the agent
  posts a refine comment server-side.
- `TaskChatPanel` caches `localAgentId` separately from `item.refineAgentId`
  so that the moment a refine reply returns a fresh agent id, the chat
  subscribes to it immediately (without waiting for the next tasks
  refetch).
- The refine spec subtask generator (`generateRefineSubtasks` in `utils.ts`)
  intentionally adds a "Write tests for…" subtask only when ≥ 2 repos are
  selected, so the spec isn't padded with a tests subtask for single-repo
  changes.
- Drag-and-drop drop targets are the column ids themselves (`useDroppable({
  id: column.id })`); the validity check in `handleDragEnd` guards against
  drops landing on a non-column droppable.
- Several files retain the original `eslint-disable` comments verbatim:
  `TaskProperties.tsx` (repo `as any`) and `ConversationPane.tsx`
  (exhaustive-deps on the scroll-callback ref).
- The server-side `POST /api/tasks/:id/start-work` endpoint takes no body
  (it derives model / provider / repo from the task row itself). The
  start-work picker therefore writes the chosen repo onto the task via
  `api.tasks.update` before calling `startWork`. The picker's model and
  provider selects are local-state-only today; surfacing them through to
  the server is a separate change in the server domain.
- The cross-domain coupling to `@/domains/chat` is intentional: `ChatView` is
  embedded with `hideChrome` inside the per-task chat panel so the refine
  agent reuses the same message rendering, composer, and streaming machinery
  as the standalone agent view.
