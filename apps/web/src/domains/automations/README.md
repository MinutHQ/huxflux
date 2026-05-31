# automations

The web UI for the automations subsystem: the list view of every automation card, the workspace for a single automation (builder chat on the left, flow / runs / settings tabs on the right), the guided multi-step setup wizard for fresh automations, and the mock chat / mock data used while the backend is empty.

## Owns

- `AutomationsView` (`/automations` route): grid of `AutomationCard` plus the `NewAutomationDialog`
- `AutomationWorkspace` (`/automations/$id` route): two-pane layout with `ChatView` (or fallback `GuidedSetup` / `MockChat`) on the left and a tab strip with `FlowGraph` / `RunsList` / `SettingsPanel` on the right
- The guided setup wizard (`GuidedSetup` + `GuidedSetupSteps`): trigger picker, description box, fake build progress, follow-up questions, then synthesized step graph
- The mock chat fallback (`MockChat` + `BuilderInput`) used before the real builder agent has been spun up
- Local mock automations (`mockData.ts`) so a fresh install has something to look at before any real automation exists

## Public surface

- `AutomationsView`: the top-level list view; the `/automations` route renders this
- `AutomationWorkspace`: the top-level workspace view; the `/automations/$automationId` route renders this

## Depends on

- `@huxflux/shared`: `api`, `useAgent`, `useAgentEvents`, plus the `Automation`, `AutomationStep`, `AutomationRun`, `AutomationStatus` types
- `@huxflux/ui`: primitives (`Button`, `Dialog`, `ScrollArea`, `ResizablePanel*`, `cn`)
- `@tanstack/react-router`: `useNavigate` for cross-route transitions
- `@tanstack/react-query`: `useQuery`, `useQueryClient` for the automation + automations list queries
- `@tabler/icons-react`: every icon in the surface
- `@/domains/chat`: `ChatView` (the builder pane reuses the standard chat surface)
- `@/hooks/useAppContext`: sidebar-collapsed state for the Tauri title-bar layout
- `@/lib/platform`: `isTauri` for the Tauri-only title-bar adjustments
- `sonner`: toast notifications for creation failures (loaded on demand)

## Sub-domains

None.

## Quirks

- `MOCK_AUTOMATIONS` is intentionally merged with the API response so a fresh install has visible automations. Each mock id begins with `mock-` and the workspace short-circuits the HTTP fetch for those ids.
- `GuidedSetup` builds the step graph synchronously from hard-coded follow-up questions. The "build progress" interval is a deliberate UX delay, not a real backend round-trip; the real flow lives in the builder agent.
- `MockChat` is only rendered when there is no real builder agent and the user opens an automation that already has steps (so the guided wizard is skipped). It is a placeholder chat that calls `onInitBuilder` to upgrade to a real agent on first send.
- `GuidedSetup` and `GuidedSetupSteps` are split because the wizard has five sub-components (trigger picker, schedule config, event config, describe, question) plus the orchestrator. Splitting them keeps each file under the 300-line `.tsx` cap and the per-component scope tight.
- Form state inside `GuidedSetup` is intentionally non-persistent; if the user navigates away, the wizard restarts. The real builder-agent chat is the durable source of truth once it exists.
