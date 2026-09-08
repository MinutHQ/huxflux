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
  // In native fullscreen the traffic lights hide, so drop their left gutter.
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
    <div>
      <div
        onMouseDown={handleMouseDown}
        className="relative flex shrink-0 items-center gap-1"
        style={{ paddingLeft: isFullscreen ? 8 : 80, paddingRight: 6, minHeight: 40 }}
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
