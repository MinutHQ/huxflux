# servers

Mobile server-management surface: the modal screen at `/servers` listing known Huxflux server entries, with per-row reachability indicators, inline add / edit / remove, and a QR-scanner entry point that parses `huxflux://` connection strings. Backed by `@huxflux/shared`'s servers slice (`getServers`, `addServer`, `removeServer`, `updateServer`, `setActiveServerId`, `parseConnectionString`, `useServerStatus`).

## Owns

- The full-screen Servers modal (`app/servers.tsx`): list of `HuxfluxServer` entries with status dots (online / offline / checking / unauthorized) sourced from `useServerStatus`, tap-to-activate, per-row edit and remove (remove uses the shared confirm modal), inline add form with URL + token + optional name, and a QR-scanner button that opens `expo-camera`'s `CameraView` over the screen
- Synchronous server-list state (the screen owns local React state because the registry is a module-level store with a `window` event but no hook subscription)
- The `/api/config` auth probe used during add and edit (5s `AbortController` timeout) to distinguish reachable, unauthorized, and unreachable before persisting

## Public surface

- `ServersScreen` — the Servers modal screen rendered by `app/servers.tsx`

## Depends on

- `@huxflux/shared` — `getServers`, `addServer`, `removeServer`, `updateServer`, `setActiveServerId`, `getActiveServerId`, `parseConnectionString`, `useServerStatus`, `HuxfluxServer`, `ServerStatus`
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

- **`c.accent` is undefined on the mobile theme.** This screen uses `(c as any).accent` for the active-row outline, the "Done" header button, the primary "Save" / "Add" buttons, and the "Active" label. Same pre-existing bug as the agents and settings domains; preserved verbatim until `apps/mobile/theme.ts` is properly typed.
- **`validateAuth` is local to this domain.** It hits `${url}/api/config` directly with the supplied token and a 5s `AbortController` timeout, returning `"ok" | "unauthorized" | "unreachable"`. The shared `api` slice is not used because at add-time we don't yet have the server in the registry and `api` is bound to the active server. If a future refactor exposes a "probe arbitrary URL" helper from the shared servers slice, this can move there.
- **Server list state is local React state, not a hook subscription.** `useState(getServers)` and `useState(getActiveServerId)` snapshot the registry on mount; mutations call `refresh()` which re-reads via `getServers()` / `getActiveServerId()`. The registry itself dispatches a `huxflux:servers-changed` window event, but the screen drives its own refresh because the events would fire while the screen is consuming user input on the add / edit forms.
- **Add / edit / scan state lives in local custom hooks.** `useAddServer`, `useEditServer`, and `useQRScanner` are defined in `ServersScreen.tsx` (not exported). They package the multi-field state + submit flow per form so the orchestrator stays under the function-size cap.
- **QR scanner camera permission is requested lazily.** The first tap on the QR button checks `useCameraPermissions()`; if not granted, `requestPermission()` is invoked and the scanner only opens after grant. Denial surfaces a `useModal().showAlert` toast.
- **Scanned QR codes must include a token.** `parseConnectionString` returns `{ url, token? }`; this screen rejects QR scans without a token (separate from the manual add form which allows the token to come from either the parsed string or the explicit token field).
- **Active server promotion.** Adding the first server (when `servers.length === 0` at the time of add) automatically promotes it to active via `setActiveServerId`. Subsequent adds leave the active server unchanged.
