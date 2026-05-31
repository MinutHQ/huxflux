# app-shell — Agent Rules

The application frame that hosts feature domains. Read the root `CLAUDE.md` and `apps/web/CLAUDE.md` first.

## What app-shell IS

The chrome around the product: top-level layout, sidebar (nav + agent list + footer), title bar, error boundary, command palette, banners, onboarding flow, and global dialogs that any route can summon (feedback, keyboard shortcuts, help menu).

## What app-shell is NOT

- **Not a domain.** No public-surface contract, no enforced `README.md`. The directory structure is conventional, not enforced.
- **Not a feature.** If something is specific to a feature (chat, settings, agents, pull-requests, file-changes), it goes in that feature's domain. The shell hosts and routes; it does not implement features.

## What belongs here

- Layout containers (sidebar shell, panel groups, route outlet wrapper)
- Cross-feature navigation (Home / Tasks / Reviews quick links, sidebar tabs, server switcher placement)
- Global UI surfaces with no single feature owner (help popover, keyboard shortcuts dialog, feedback CTA, onboarding banners, command palette)
- Error/notification surfaces that wrap the whole app

## What does NOT belong here

- Feature business logic. Use the feature's domain.
- Reusable UI primitives. Use `@huxflux/ui` (`packages/ui`).
- Cross-platform hooks/types/API helpers. Use `@huxflux/shared` (`packages/shared`).

## Layout

```
app-shell/
  CLAUDE.md
  TitleBar.tsx              Tauri/macOS traffic-light spacer + drag region
  ErrorBoundary.tsx         Top-level React error boundary
  CommandPalette.tsx        Cmd-K agent picker
  FeedbackDialog.tsx        Global feedback modal (file an issue)
  Onboarding.tsx            First-run server connect flow
  banners/                  Top-of-window status banners
    DisconnectedBanner.tsx
    UpdateBanner.tsx
  server-switcher/          Sidebar-footer server picker (split for size cap)
    ServerSwitcher.tsx      Trigger + open/close state
    ServerDropdown.tsx      Portal-rendered list of servers
    ServerRow.tsx           Single row with inline token-edit
    AddServerForm.tsx       Inline new-server form
    StatusDot.tsx           Status indicator dot
    validateAuth.ts         /api/config probe helper
  sidebar/                  Left nav: title bar, tabs, agent list, footer
    Sidebar.tsx             Orchestrator
    SidebarNav.tsx          Home / Tasks quick links
    SidebarTabs.tsx         Agents / Review / Refine tab strip
    SidebarFooter.tsx       Server switcher + help + settings + collapse
    HelpPopover.tsx
    KeyboardShortcutsDialog.tsx
    RefinePane.tsx
    pr-list/                Sub-folder for the PR review pane
    types.ts
```

Group related files in sub-folders when one piece grows beyond a single file (`server-switcher/`, `sidebar/`, `banners/`). Single-file features stay at the top level.

## Imports

- app-shell consumes feature surfaces by importing a specific top-level file from a domain (e.g. `@/domains/agents/AgentList`, `@/domains/tasks/RefinePane`). Subfolders inside a domain are private; do not reach into them.
- Feature domains do NOT import from app-shell. If a feature thinks it needs something from app-shell, the abstraction is wrong — surface it as a domain export instead.
- Other web-app code may import from `@/app-shell/...` directly; there is no public-surface gate.

## File size caps (same as domains)

- `.tsx`: 300 lines max
- `.ts`: 400 lines max
- per-function: 150 lines (`.tsx`) / 80 lines (`.ts`)

If a file or function hits the cap, split it. Don't bypass with `eslint-disable`.

## Cross-platform note

Each platform may grow its own app-shell (`apps/mobile/app-shell/`, `apps/desktop/src/app-shell/`) following the same conventions. Don't share components between them through this directory — promote to `packages/ui` or `packages/shared` instead.
