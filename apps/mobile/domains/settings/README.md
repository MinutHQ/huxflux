# settings

Mobile settings surface. The Settings tab is a hub (server card, repositories, then a list of sections) and each section is its own pushed screen under `/settings/<section>`. The domain also owns the Add-workspace flows (open project, add folder, clone from URL, quick start) and the per-repo settings screen. Server-side settings come from the shared settings schema; device-local preferences go through `@/lib/prefs`.

## Owns

- The Settings tab hub (`SettingsScreen`): server card (tap for `/servers`), repositories list with an "Add workspace" entry, section rows grouped into Server and This device, and the Feedback dialog (gated on `useServerConfig().feedbackEnabled`)
- Section screens (`SettingsSectionScreen`), one per `MobileSettingsSection`:
  - Server-side, driven by `settingsSchema` from `@huxflux/shared`: Git (`SchemaSection`), Experimental (thread agents), Updates (channel + auto-update, plus server version check / update), Integrations (Jira fields plus a connection test), Review (prompt with 800ms debounced save, provider and model pickers backed by `/api/providers`)
  - Models: show / hide models in the switcher and pick the default model + provider. Stores `hiddenModels` with the same `provider:api` key format the web page uses
  - GitHub: read-only connection status with a re-check button
  - Device-local: General (strip "You're absolutely right", always show context), Notifications (on/off and sound for the agent-finished notification fired from `app/_layout.tsx`), Appearance (theme picker)
- The Add-workspace modal (`AddRepoScreen`, `mode` param): open project (server-side repo discovery with server search, or a hand-typed path with directory suggestions), add folder (non-git root, no branch), clone from URL, quick start from a template. `useAddRepoMenu` opens the action sheet that leads here; it is exposed to the agents domain through `AddRepoMenu.ts`
- The per-repo settings screen (`RepoSettingsScreen`, `/repo/:id`): branch from, remote, branch prefix, preview URL, setup and run scripts, auto-saved after 800ms, plus remove repository. Git-only fields are hidden for folder repos

## Public surface

- `SettingsScreen` — the Settings-tab hub rendered by `app/(tabs)/settings.tsx`
- `SettingsSectionScreen`, `isMobileSettingsSection`, `MobileSettingsSection` — the pushed section screen rendered by `app/settings/[section].tsx`
- `AddRepoScreen`, `isAddRepoMode`, `AddRepoMode` — the Add-workspace modal rendered by `app/add-repo.tsx`
- `AddRepoMenu` (`useAddRepoMenu`) — opens the Add-workspace action sheet; used by the agent list header
- `RepoSettingsScreen` — per-repo settings rendered by `app/repo/[id].tsx`

## Depends on

- `@huxflux/shared` — `api`, `queryKeys`, `useHuxfluxQuery`, `useHuxfluxMutation`, `useRepos`, `useServersStore`, `useServerConfig`, `settingsSchema`, `settingsDefaults`, repo and settings types
- `@huxflux/tokens` — via `apps/mobile/theme.ts` (`c`, `themes`, `useTheme`)
- `@expo/vector-icons` — `Ionicons`
- `react-native`, `react-native-safe-area-context`, `expo-router`, `@tanstack/react-query`
- `@/theme`, `@/ui` (`useModal` for action sheets / confirms / alerts), `@/lib/prefs`

## Sub-domains

None. Internal folders: `components/` (form primitives in `FormField.tsx`, `PathInput.tsx`, `SettingsRow.tsx`; `add-repo/`, `sections/`, `server-settings/`), `hooks/` (`useServerSettings`, `useAddRepoMenu`, `useDebouncedValue`), `screens/`.

## Quirks

- **Server settings are read through `useServerSettings`**, which fills schema defaults under the fetched blob and applies patches optimistically to the query cache. Screens never call `api.settings.*` directly.
- **`SchemaField` renders a schema entry by its `type`.** Text and number fields save when editing ends, not per keystroke. Select fields with `options: "models" | "providers"` are not rendered generically; the Review screen handles them with action sheets. `stringArray` (hidden models) has its own Models screen.
- **Keys with `token`, `secret` or `password` in their name render as secure text** (Jira API token today).
- **Repo icons are not editable on mobile.** The web icon picker uses Tabler icon names that have no Ionicons equivalent; the field is left untouched by the mobile PATCH so a web-chosen icon survives.
- **Folder repos.** "Add folder" sends `type: "folder"` with empty `branchFrom` / `remote`, matching web. The server now persists `type` on create.
- **Local prefs that nothing reads were removed** (auto-convert, auto-push, delete-branch-on-archive, archive-on-merge). Web dropped the same Git toggles for the same reason.
- **`FeedbackModal` uses the RN `Modal` primitive directly** rather than the `@/ui` provider: it is a bottom-sheet form, not an alert.
