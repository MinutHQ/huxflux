// True when running inside a Tauri desktop window.
// The build-time check (TAURI_PLATFORM) lets Vite tree-shake desktop-only
// code from production web bundles. The runtime fallback (__TAURI__) covers
// `tauri dev` where the env var may not be injected into the Vite process.
export const isTauri: boolean =
  !!import.meta.env.TAURI_PLATFORM || '__TAURI_INTERNALS__' in window

// True only on macOS Tauri builds — used to gate macOS-specific UI (e.g. traffic
// light spacer). Falls back to the runtime internals object's platform field.
export const isMacOS: boolean =
  import.meta.env.TAURI_PLATFORM === 'macos' ||
  ((window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentPlatform?: string } } }).__TAURI_INTERNALS__?.metadata?.currentPlatform === 'macos')
