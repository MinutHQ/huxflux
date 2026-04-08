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

// Opens a URL in the system browser. On desktop (Tauri) this uses the native
// open_url command; on web it falls back to window.open.
export function openExternal(url: string): void {
  if (isTauri) {
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("open_url", { url }))
  } else {
    window.open(url, "_blank")
  }
}

// onClick handler for <a> tags — on Tauri, prevents default and opens in
// system browser. No-op on web so default anchor behavior works.
export function handleExternalClick(e: { preventDefault: () => void; currentTarget: HTMLAnchorElement }): void {
  if (!isTauri) return
  e.preventDefault()
  const url = e.currentTarget.href
  if (url) import("@tauri-apps/api/core").then(({ invoke }) => invoke("open_url", { url }))
}
