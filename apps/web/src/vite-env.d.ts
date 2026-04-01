/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Set automatically by the Tauri CLI during tauri dev / tauri build.
  // Undefined in plain web builds — used to detect the desktop context.
  readonly TAURI_PLATFORM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
