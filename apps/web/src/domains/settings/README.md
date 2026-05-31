# settings

User-facing settings page. Left nav with sections (General, Models, Providers, Appearance, Git, Review, Servers, Integrations, Experimental, Advanced, Updates) and per-repository settings. Also exposes the dialogs the sidebar uses for adding a new repository.

## Owns

- The full-screen `/settings` page with left-nav + content layout
- Per-section settings UIs (one component per section)
- Per-repository settings UI (icon, paths, branch, remote, scripts, preferences)
- The "Add repository" / "Clone from URL" / "Quick start" dialogs (consumed by the app shell sidebar)
- Settings nav config (section list, ordering, icons)
- Repo color hashing and icon picker used by the page

## Public surface

- `SettingsPage` — the route-rendered top-level component
- `AddRepoDialog` — modal for adding an existing local repository or folder (used by sidebar). Accepts `initialType: "git" | "folder"` to preset the toggle.
- `CloneRepoDialog` — modal for cloning a repository from a URL (used by sidebar)
- `QuickStartDialog` — modal for scaffolding a new project from a template (used by sidebar)
- `Section` — type of the active section identifier (used by route)

## Depends on

- `@huxflux/shared` — `useRepos`, `api`, `parseConnectionString`, `Repo`, `HuxfluxServer`
- `@huxflux/ui` — primitives (Button, Switch, Select, cn)
- `@tabler/icons-react` — icons
- `@/lib/theme`, `@/lib/colorThemes`, `@/lib/sounds`, `@/lib/notificationPrefs`, `@/lib/diffPrefs`, `@/lib/flags`, `@/lib/platform` — preference accessors
- `@/hooks/useServers`, `@/hooks/useServerStatus` — server registry (legacy; will move into a `servers` domain later)

## Sub-domains

None.

## Quirks

- The dialogs (`AddRepoDialog`, `CloneRepoDialog`, `QuickStartDialog`) are exposed publicly because the Sidebar opens them too. When a `repositories` domain is extracted in the future these will move there and `settings/` will import from it.
- The auto-save effect in `RepoSettings` uses a debounced 800ms `useEffect` with `eslint-disable react-hooks/exhaustive-deps`. The dependency list is exactly the set of save fields — adding `repo.id` would cause spurious saves when switching repos.
- `PathInput` lives in `components/` even though only the dialogs use it, because it's domain-internal and the size cap argued against inlining it into both dialog files.
- The `MODELS` constant in `sections/ModelsSettings.tsx` is hardcoded for now. Eventually it should come from the provider capability data.
- Git section only contains server-backed toggles (kill processes / PR comment monitoring / CI monitoring). The earlier localStorage toggles (auto-push, delete-branch-on-archive, archive-on-merge) were ghost UI and have been removed.
