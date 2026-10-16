import { useRef, useState } from "react"
import { cn } from "@huxflux/ui"
import { IconDots } from "@tabler/icons-react"
import { isMacOS, isTauri } from "@/lib/platform"
import { ServerAvatar } from "./ServerAvatar"
import { ServerDropdown } from "./ServerDropdown"
import { useSwitcherServers } from "./useSwitcherServers"

interface ServerRailProps {
  orientation: "vertical" | "horizontal"
}

/**
 * Every server as a one-click avatar, either as a Slack-style column beside
 * the sidebar (`vertical`) or as a strip at the bottom of it (`horizontal`).
 * The trailing dots button opens the full dropdown for add / token edits.
 */
export function ServerRail({ orientation }: ServerRailProps) {
  const { servers, activeServer, statuses, attention, setActive, update } = useSwitcherServers()
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const vertical = orientation === "vertical"

  function handleToggleMenu(e: React.MouseEvent) {
    e.stopPropagation()
    if (anchorRect) { setAnchorRect(null); return }
    const rect = moreRef.current?.getBoundingClientRect()
    if (rect) setAnchorRect(rect)
  }

  return (
    <div
      className={cn(
        "shrink-0 flex items-center gap-2 bg-sidebar",
        vertical ? "flex-col w-12 h-full py-3 border-r border-sidebar-border overflow-y-auto" : "px-2.5 py-2 overflow-x-auto",
        // Clear the macOS traffic lights that sit over the top-left corner.
        vertical && isTauri && isMacOS && "pt-11"
      )}
    >
      {servers.map((server) => (
        <ServerAvatar
          key={server.id}
          server={server}
          status={statuses[server.id] ?? "checking"}
          attention={attention[server.id]}
          isActive={server.id === activeServer?.id}
          onSelect={() => setActive(server.id)}
          onChangeAppearance={(patch) => update(server.id, patch)}
          tooltipSide={vertical ? "right" : "top"}
          size={vertical ? "md" : "lg"}
        />
      ))}
      <button
        ref={moreRef}
        onMouseDown={handleToggleMenu}
        title="Manage servers"
        className={cn(
          "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors",
          vertical && "mt-auto"
        )}
      >
        <IconDots size={14} />
      </button>
      {anchorRect && (
        <ServerDropdown anchorRect={anchorRect} placement={vertical ? "right" : "above"} onClose={() => setAnchorRect(null)} />
      )}
    </div>
  )
}
