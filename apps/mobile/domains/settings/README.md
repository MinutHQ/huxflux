# settings

Mobile settings surface: the Settings-tab page (server card, general / git / review / theme / feedback sections) and the modal Add-Repo screen reached from the home agent list. Backed by `@huxflux/shared`'s settings api slice (for server-side settings + feedback) and the `@/lib/prefs` accessors (for client-only preference toggles).

## Owns

- The full-screen Settings tab: server card (active server name + url + total count, tap to navigate to `/servers`), General prefs (auto-convert, strip "You're absolutely right", always-show-context), Git prefs (auto-push, delete-branch-on-archive, archive-on-merge), Review prompt (debounced server-side persistence with a "Saved" pill), theme picker (dark + light groups with mini palette swatches), and the in-app Feedback dialog (gated on `useServerConfig().feedbackEnabled`)
- The modal Add-Repo screen: server-side repo discovery (`api.findRepos`) with search-filter, "Branch from" autodetection (`api.getDefaultBranch`), final create-repo submission (`api.createRepo`), and TanStack Query invalidation of the repo list on success

## Public surface

- `SettingsScreen` — the Settings-tab screen rendered by `app/(tabs)/settings.tsx`
- `AddRepoScreen` — the Add-Repo modal screen rendered by `app/add-repo.tsx`

## Depends on

- `@huxflux/shared` — `api`, `getActiveServer`, `getServers`, `useServerConfig`
- `@huxflux/tokens` — via `apps/mobile/theme.ts` (`c`, `themes`, `useTheme`)
- `@expo/vector-icons` — `Ionicons`
- `react-native` — primitives (`View`, `Text`, `TextInput`, `TouchableOpacity`, `Switch`, `ScrollView`, `Modal`, `FlatList`, `ActivityIndicator`)
- `react-native-safe-area-context` — `useSafeAreaInsets`
- `@tanstack/react-query` — invalidating `["repos"]` after `createRepo`
- `expo-router` — `useRouter`
- `@/theme` — `c`, `themes`, `useTheme`, `MobileTheme`
- `@/ui` — `useModal` for action sheets / confirms / alerts
- `@/lib/prefs` — `prefs` accessors for the local-only toggles (strip-youre-right, always-context, auto-convert, git-auto-push, git-delete-branch, git-archive-on-merge)

## Sub-domains

None.

## Quirks

- **`c.accent` is undefined on the mobile theme.** `AddRepoScreen` uses `(c as any).accent` for the discover-loading spinner and the primary "Add repo" button. Same pre-existing bug the agents domain documents (the dashboard uses it too). Preserved verbatim until `apps/mobile/theme.ts` is properly typed and the missing key is added.
- **Storage keys.** All prefs go through `@/lib/prefs` which owns the actual `huxflux:*` keys (`strip:youre-right`, `always:context`, `auto:convert`, `git:auto-push`, `git:delete-branch-on-archive`, `git:archive-on-merge`). The server-side review prompt is persisted via `api.updateSettings({ reviewPrompt })` with an 800ms debounce; the local UI flips `reviewSaved` once the network call resolves.
- **`FeedbackModal` uses the RN `Modal` primitive directly** instead of the shared `@/ui` provider. The shared modal is for action sheets / confirms / alerts; the feedback flow needs a bottom-sheet form with two text inputs and a submit button, which is its own thing. The provider's `showAlert` is still used to surface success / error toasts after the network call.
- **`SettingsScreen` reads `getActiveServer()` / `getServers()` synchronously** on every render via the server-card sub-component. These are pure storage reads through the configured RN AsyncStorage cache, so this is cheap; if the server list ever moves to a reactive subscription, the card will need to consume that.
- **Add-Repo discovery is fire-and-forget.** `api.findRepos()` runs once on mount, errors are silently swallowed, and `loadingDiscovered` flips to false unconditionally. If the server isn't reachable the screen shows "No repos found"; the operator path is to add a server first via `/servers`.
- **Theme picker reads from `c` directly.** `ThemeSwatch` reads palette values off each `MobileTheme.palette` (not the mutable `c` object). The picker is read-only for color values; `useTheme().setThemeId(id)` mutates `c` in place and bumps the context to re-render the tree.
