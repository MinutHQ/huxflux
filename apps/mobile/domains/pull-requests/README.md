# pull-requests

Mobile pull-request surface: the agent-scoped PR pane that the agents domain renders as a slot inside `AgentDetailScreen` (PR summary, reviews, checks, open review threads, discussion, mark-ready / re-request-review actions). Backed cross-platform by `@huxflux/shared`'s pull-requests slice; screens compose RN primitives only.

## Owns

- The agent-scoped PR pane (PR summary, reviews, checks, open review threads with reply + resolve, top-level issue comments, mark-ready and re-request-review actions) consumed by the agents-domain `AgentDetailScreen` via its `prPaneSlot: ReactNode` prop

## Public surface

- `AgentPRPane` — per-agent PR pane consumed by the agents-domain `AgentDetailScreen` via `prPaneSlot`

## Depends on

- `@huxflux/shared` — `api`, `useAgent`, types (`PRDetails`, `PRStatus`, `PRReview`, `PRCheck`, `PRComment`, `PRThread`, `PRIssueComment`)
- `@huxflux/tokens` — via `apps/mobile/theme.ts` (`c`, `prColors`)
- `@expo/vector-icons` — `Ionicons`
- `react-native` — primitives (`View`, `Text`, `ScrollView`, `TouchableOpacity`, `TextInput`, etc.)
- `@tanstack/react-query` — PR detail queries, optimistic invalidations on action callbacks
- `@/theme` — `c`, `prColors`
- `@/domains/agents` — `Markdown` (the RN markdown renderer the PR comment components share with the chat surface)
- `@/ui` — `useModal` for action sheets / confirms / alerts

## Sub-domains

None.

## Quirks

- **`AgentPRPane` is rendered as a slot.** The agents-domain `AgentDetailScreen` accepts `prPaneSlot: ReactNode`. The route at `app/agent/[id]/index.tsx` constructs `<AgentPRPane agentId={id} />` from this domain and passes it through. Once the agents domain no longer needs the slot indirection, it can import `AgentPRPane` directly.
- **`Markdown` cross-domain import.** The PR comment components (`ThreadCard`, `IssueCommentCard`) import `Markdown` from `@/domains/agents` (which re-exports it from the agents-domain index). The agents domain owns the only RN markdown renderer in the app; it stays there until a shared mobile-primitives location exists.
- **Optimistic React Query invalidations.** Every mutating action (`markPRReady`, `rerequestReview`, `replyToPRComment`, `resolveThread`) invalidates the relevant cached queries (`pr-details`, `agents.detail`) so the detail surface refreshes without manual refetch logic in the screen.
