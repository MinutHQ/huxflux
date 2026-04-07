// True when running inside a Tauri desktop window.
// The build-time check (TAURI_ENV_PLATFORM) lets Vite tree-shake desktop-only
// code from production web bundles. The runtime fallback (__TAURI_INTERNALS__) covers
// `tauri dev` where the env var may not be injected into the Vite process.
export const isTauri: boolean =
  !!import.meta.env.TAURI_ENV_PLATFORM || '__TAURI_INTERNALS__' in window

// True only on macOS — used to gate macOS-specific UI (e.g. traffic light spacer).
// 'Macintosh' in UA is reliable for macOS (excludes iPhone/iPad which use different strings).
export const isMacOS: boolean =
  import.meta.env.TAURI_ENV_PLATFORM === 'macos' ||
  (isTauri && typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh'))
