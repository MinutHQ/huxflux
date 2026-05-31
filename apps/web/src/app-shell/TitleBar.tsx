import { isTauri, isMacOS } from "@/lib/platform"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { invoke } from "@tauri-apps/api/core"

// Spacer that reserves space for the native macOS traffic lights.
// Uses manual drag/zoom instead of data-tauri-drag-region so that
// double-click calls native [NSWindow zoom:] (smooth animation) rather
// than Tauri's toggleMaximize() which snaps to top-left.
// Returns null in a plain browser or on Linux/Windows (native title bar).
export function TitleBar() {
  if (!isTauri || !isMacOS) return null

  function handleMouseDown(e: React.MouseEvent) {
    // Traffic lights occupy the left ~75px — let macOS handle those natively
    if (e.clientX < 75) return
    if (e.detail === 2) {
      invoke("zoom_window")
    } else {
      getCurrentWindow().startDragging()
    }
  }

  return <div onMouseDown={handleMouseDown} className="h-10 shrink-0" />
}
