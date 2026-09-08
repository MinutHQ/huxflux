import { getCurrentWindow } from "@tauri-apps/api/window"
import { invoke } from "@tauri-apps/api/core"
import { IconLayoutSidebarLeftExpand, IconLayoutSidebarLeftCollapse } from "@tabler/icons-react"
import { Button } from "@huxflux/ui"
import { isTauri, isMacOS } from "@/lib/platform"
import { useIsFullscreen } from "@/app-shell/useIsFullscreen"

interface SidebarHeaderProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

// On macOS, reserve a native drag region for traffic lights and the collapse
// toggle.
export function SidebarHeader({ sidebarCollapsed, onToggleSidebar }: SidebarHeaderProps) {
  const isMacDesktop = isTauri && isMacOS
  // In native fullscreen, put the toggle beside Home without reserving a row.
  const isFullscreen = useIsFullscreen()

  if (!isMacDesktop) return null

  // Native macOS drag: empty areas drag the window, double-click zooms. The
  // left ~75px belongs to the traffic lights, so let macOS handle those.
  function handleMouseDown(e: React.MouseEvent) {
    if (e.clientX < 75) return
    if (e.detail === 2) {
      invoke("zoom_window")
    } else {
      getCurrentWindow().startDragging()
    }
  }

  return (
    <div className={isFullscreen ? "relative h-0 shrink-0" : undefined}>
      <div
        onMouseDown={isFullscreen ? undefined : handleMouseDown}
        className={isFullscreen ? "absolute right-2 top-2 z-10 flex items-center" : "relative flex shrink-0 items-center gap-1"}
        style={isFullscreen ? undefined : { paddingLeft: 80, paddingRight: 6, minHeight: 40 }}
      >
        <div className="min-w-0 flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Show sidebar (⌘B)" : "Hide sidebar (⌘B)"}
        >
          {sidebarCollapsed ? <IconLayoutSidebarLeftExpand size={14} /> : <IconLayoutSidebarLeftCollapse size={14} />}
        </Button>
      </div>
    </div>
  )
}
