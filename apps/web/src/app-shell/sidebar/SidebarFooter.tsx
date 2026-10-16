import React from "react"
import { IconQuestionMark, IconSettings } from "@tabler/icons-react"
import { Button } from "@huxflux/ui"
import { ServerSwitcher } from "@/app-shell/server-switcher/ServerSwitcher"
import { ServerChips } from "@/app-shell/server-switcher/ServerChips"
import { ServerRail } from "@/app-shell/server-switcher/ServerRail"
import { useSwitcherLayout } from "@/app-shell/server-switcher/switcherLayout"

interface SidebarFooterProps {
  helpBtnRef: React.RefObject<HTMLButtonElement | null>
  onToggleHelp: () => void
  onOpenSettings: () => void
}

/**
 * The bottom row of the sidebar: server switcher in the chosen layout (left,
 * flex-1; the vertical rail lives in `Sidebar` instead), help popover
 * trigger, and settings shortcut. Sidebar collapse lives in the top-of-sidebar
 * toggle; not duplicated here.
 */
export function SidebarFooter({ helpBtnRef, onToggleHelp, onOpenSettings }: SidebarFooterProps) {
  const layout = useSwitcherLayout()
  return (
    <div className="border-t border-sidebar-border shrink-0 flex items-center gap-1 pr-1">
      <div className="flex-1 min-w-0">
        {layout === "chips" ? <ServerChips />
          : layout === "bottom-rail" ? <ServerRail orientation="horizontal" />
          : <ServerSwitcher compact={layout === "rail"} />}
      </div>
      <Button
        ref={helpBtnRef}
        variant="ghost"
        size="icon-xs"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onToggleHelp}
        title="Help"
      >
        <IconQuestionMark size={13} />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onOpenSettings}>
        <IconSettings size={13} />
      </Button>
    </div>
  )
}
