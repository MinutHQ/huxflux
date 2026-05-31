import React from "react"
import { IconQuestionMark, IconSettings } from "@tabler/icons-react"
import { Button } from "@huxflux/ui"
import { ServerSwitcher } from "@/app-shell/server-switcher/ServerSwitcher"

interface SidebarFooterProps {
  helpBtnRef: React.RefObject<HTMLButtonElement | null>
  onToggleHelp: () => void
  onOpenSettings: () => void
}

/**
 * The bottom row of the sidebar: server switcher (left, flex-1), help popover
 * trigger, and settings shortcut. Sidebar collapse lives in the top-of-sidebar
 * toggle; not duplicated here.
 */
export function SidebarFooter({ helpBtnRef, onToggleHelp, onOpenSettings }: SidebarFooterProps) {
  return (
    <div className="border-t border-sidebar-border shrink-0 flex items-center gap-1 pr-1">
      <div className="flex-1 min-w-0">
        <ServerSwitcher />
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
