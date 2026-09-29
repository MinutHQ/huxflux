# servers

Mobile server-management surface: the modal screen at `/servers` listing known Huxflux server entries, with per-row reachability indicators, inline add / edit / remove, and a QR-scanner entry point that parses `huxflux://` connection strings. Backed by `@huxflux/shared`'s servers slice (`getServers`, `addServer`, `removeServer`, `updateServer`, `setActiveServerId`, `parseConnectionString`, `useServerStatus`).

## Owns

- The full-screen Servers modal (`app/servers.tsx`): list of `HuxfluxServer` entries with status dots (online / offline / checking / unauthorized) sourced from `useServerStatus`, tap-to-activate, per-row edit and remove (remove uses the shared confirm modal), inline add form with URL + token + optional name, and a QR-scanner button that opens `expo-camera`'s `CameraView` over the screen
- Nothing else: server-list state comes from `useServersStore()` in `@huxflux/shared`, so every mutation re-renders the screen
- The `/api/config` auth probe used during add and edit (5s `AbortController` timeout) to distinguish reachable, unauthorized, and unreachable before persisting

## Public surface

- `ServersScreen` — the Servers modal screen rendered by `app/servers.tsx`

## Depends on

- `@huxflux/shared` — `useServersStore`, `addServer`, `removeServer`, `updateServer`, `setActiveServerId`, `parseConnectionString`, `useServerStatus`, `HuxfluxServer`, `ServerStatus`
- `@huxflux/tokens` — via `apps/mobile/theme.ts` (`c`)
- `@expo/vector-icons` — `Ionicons`
- `react-native` — primitives (`View`, `Text`, `TextInput`, `TouchableOpacity`, `ScrollView`, `KeyboardAvoidingView`, `Modal`)
- `expo-router` — `useRouter`, `Stack.Screen`
- `expo-camera` — `CameraView`, `useCameraPermissions` (QR scanner)
- `@/theme` — `c`
- `@/ui` — `useModal` for the remove-confirm flow and add/scan error alerts

## Sub-domains

None.

## Quirks

- **Accent colour.** The active-row outline, the "Done" header button, the primary "Save" / "Add" buttons and the "Active" label use `c.accent` (the theme's `fgBright`) with `c.accentFg` for text on top of it. Both are set by `applyTheme` in `apps/mobile/theme.ts`.
- **`validateAuth` is local to this domain.** It hits `${url}/api/config` directly with the supplied token and a 5s `AbortController` timeout, returning `"ok" | "unauthorized" | "unreachable"`. The shared `api` slice is not used because at add-time we don't yet have the server in the registry and `api` is bound to the active server. If a future refactor exposes a "probe arbitrary URL" helper from the shared servers slice, this can move there.
- **Server list state is the shared store subscription.** `useServersStore()` re-renders the screen on every add / edit / remove / set-active. The add and edit forms keep their own local input state, so a re-render mid-typing does not lose input.
- **Add / edit / scan state lives in local custom hooks.** `useAddServer`, `useEditServer`, and `useQRScanner` are defined in `ServersScreen.tsx` (not exported). They package the multi-field state + submit flow per form so the orchestrator stays under the function-size cap.
- **QR scanner camera permission is requested lazily.** The first tap on the QR button checks `useCameraPermissions()`; if not granted, `requestPermission()` is invoked and the scanner only opens after grant. Denial surfaces a `useModal().showAlert` toast.
- **Scanned QR codes must include a token.** `parseConnectionString` returns `{ url, token? }`; this screen rejects QR scans without a token (separate from the manual add form which allows the token to come from either the parsed string or the explicit token field).
- **Active server promotion.** Adding the first server (when `servers.length === 0` at the time of add) automatically promotes it to active via `setActiveServerId`. Subsequent adds leave the active server unchanged.
