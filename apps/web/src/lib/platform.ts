// True when running inside a Tauri desktop window.
// The build-time check (TAURI_PLATFORM) lets Vite tree-shake desktop-only
// code from production web bundles. The runtime fallback (__TAURI__) covers
// `tauri dev` where the env var may not be injected into the Vite process.
export const isTauri: boolean =
  !!import.meta.env.TAURI_PLATFORM || '__TAURI_INTERNALS__' in window
