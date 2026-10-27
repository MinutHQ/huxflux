# servers

Mobile server-management surface: the modal screen at `/servers` listing known Huxflux server entries, with per-row reachability indicators, inline add / edit / remove, a QR-scanner entry point that parses `huxflux://` connection strings, and an add-via-proxy flow for servers behind the public relay (`apps/proxy`). Backed by `@huxflux/shared`'s servers slice (`getServers`, `addServer`, `removeServer`, `updateServer`, `setActiveServerId`, `parseConnectionString`, `useServerStatus`).

## Owns

- The full-screen Servers modal (`app/servers.tsx`): list of `HuxfluxServer` entries with status dots (online / offline / checking / unauthorized) sourced from `useServerStatus`, tap-to-activate, per-row edit and remove (remove uses the shared confirm modal), inline add form with URL + token + optional name, and a QR-scanner button that opens `expo-camera`'s `CameraView` over the screen
- The add-via-proxy flow (`ProxyConnectForm` + `hooks/useProxyConnect.ts`): enter the proxy base URL, sign in with Google in the system browser (Safari on iOS), then pick one of the account's registered servers. The chosen entry is stored as `<proxy>/s/<serverId>` with its proxy access / refresh tokens and becomes active
- Re-sign-in for proxied servers: a key button on proxied rows re-runs the proxy sign-in and stores fresh tokens on the existing entry (for when the refresh token is revoked or expired). While it waits, the key becomes a cancel button
- Nothing else: server-list state comes from `useServersStore()` in `@huxflux/shared`, so every mutation re-renders the screen
- The `/api/config` auth probe used during add and edit (5s `AbortController` timeout) to distinguish reachable, unauthorized, and unreachable before persisting

## Public surface

- `ServersScreen` — the Servers modal screen rendered by `app/servers.tsx`

## Depends on

- `@huxflux/shared` — `useServersStore`, `addServer`, `removeServer`, `updateServer`, `setActiveServerId`, `parseConnectionString`, `useServerStatus`, `isProxiedServer`, `serverAuthHeaders`, `proxyOriginOf`, `runProxyAuthFlow`, `fetchProxyServers`, `HuxfluxServer`, `ServerStatus`, `ProxyServerInfo`, `ProxyToken`
- `@huxflux/tokens` — via `apps/mobile/theme.ts` (`c`)
- `@expo/vector-icons` — `Ionicons`
- `react-native` — `Linking` (proxy sign-in in Safari), primitives (`View`, `Text`, `TextInput`, `TouchableOpacity`, `ScrollView`, `KeyboardAvoidingView`, `Modal`)
- `expo-router` — `useRouter`, `Stack.Screen`
- `expo-camera` — `CameraView`, `useCameraPermissions` (QR scanner)
- `@/theme` — `c`
- `@/ui` — `useModal` for the remove-confirm flow and add/scan error alerts

## Sub-domains

None.

## Quirks

- **Accent colour.** The active-row outline, the "Done" header button, the primary "Save" / "Add" buttons and the "Active" label use `c.accent` (the theme's `fgBright`) with `c.accentFg` for text on top of it. Both are set by `applyTheme` in `apps/mobile/theme.ts`.
- **`validateAuth` is local to this domain.** It hits `${url}/api/config` directly with the supplied token and a 5s `AbortController` timeout, returning `"ok" | "unauthorized" | "unreachable"`. Headers come from shared `serverAuthHeaders`, so the probe sends the right credential for the URL shape. The shared `api` slice is not used because at add-time we don't yet have the server in the registry and `api` is bound to the active server. If a future refactor exposes a "probe arbitrary URL" helper from the shared servers slice, this can move there.
- **Server list state is the shared store subscription.** `useServersStore()` re-renders the screen on every add / edit / remove / set-active. The add and edit forms keep their own local input state, so a re-render mid-typing does not lose input.
- **Add / edit / scan state lives in local custom hooks.** `useAddServer`, `useEditServer`, and `useQRScanner` are defined in `ServersScreen.tsx` (not exported). They package the multi-field state + submit flow per form so the orchestrator stays under the function-size cap.
- **QR scanner camera permission is requested lazily.** The first tap on the QR button checks `useCameraPermissions()`; if not granted, `requestPermission()` is invoked and the scanner only opens after grant. Denial surfaces a `useModal().showAlert` toast.
- **Scanned QR codes must include a token.** `parseConnectionString` returns `{ url, token? }`; this screen rejects QR scans without a token (separate from the manual add form which allows the token to come from either the parsed string or the explicit token field).
- **Active server promotion.** Adding the first server (when `servers.length === 0` at the time of add) automatically promotes it to active via `setActiveServerId`. Subsequent adds leave the active server unchanged.
- **Proxy sign-in uses Safari, not an in-app browser sheet.** An `SFSafariViewController` sheet closed when the user switched to an authenticator app for Google 2FA, which killed the sign-in. The system browser survives app switching (and can autofill TOTP codes). JS timers pause while Huxflux is backgrounded, so polling resumes and picks up the token when the user switches back.
- **Proxy sign-in cancellation rides on the injectable `sleep`.** `runProxyAuthFlow` has no abort signal, so callers pass a `SignInCancel` object and `signInWithSystemBrowser` supplies a `sleep` that rejects once `cancelled` is set. Cancel (the form's Cancel button, the row's cancel icon, or leaving the screen) stops polling within one interval; a cancelled sign-in shows no error.
- **Proxied servers edit only their name.** URL and credentials come from the proxy sign-in, so `ServerEditForm` hides the URL and token fields when `proxied` is set and save skips the auth probe.
