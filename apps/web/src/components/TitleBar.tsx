import { isTauri } from "@/lib/platform"

// Spacer that reserves space for the native macOS traffic lights when running
// inside a Tauri window with titleBarStyle "overlay". The drag region lets
// the user drag the window from the sidebar's top area.
// Returns null in a plain browser — no spacer needed there.
export function TitleBar() {
  if (!isTauri) return null

  return <div data-tauri-drag-region className="h-7 shrink-0" />
}
