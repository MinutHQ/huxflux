import { useState, useRef } from "react"
import { cn } from "@huxflux/ui"
import { useServers } from "@/hooks/useServers"
import { useServerStatus } from "@huxflux/shared"
import { IconChevronDown, IconServer } from "@tabler/icons-react"
import { StatusDot } from "./StatusDot"
import { ServerDropdown } from "./ServerDropdown"

/**
 * Sidebar-footer trigger that summarises the active server (name + status)
 * and expands into a `ServerDropdown` portal listing every configured server.
 * Owns only the open/closed state; the list and per-server affordances live
 * in `ServerDropdown` / `ServerRow`.
 */
export function ServerSwitcher() {
  const { servers, activeServer } = useServers()
  const statuses = useServerStatus(servers)
  // Capture the trigger's rect at open time so the dropdown can portal
  // anchored to it without reading refs during render.
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeStatus = activeServer ? (statuses[activeServer.id] ?? "checking") : "checking"
  const isUnauthorized = activeStatus === "unauthorized"

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (anchorRect) {
      setAnchorRect(null)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setAnchorRect(rect)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onMouseDown={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-sidebar-accent/60 transition-colors text-left"
      >
        <div className="w-5 h-5 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <IconServer size={11} className="text-primary" />
        </div>
        <span className={cn("text-[12px] font-medium flex-1 min-w-0 truncate", isUnauthorized ? "text-amber-400" : "text-sidebar-foreground")}>
          {activeServer?.name ?? "No server"}
        </span>
        <StatusDot status={activeStatus} />
        <IconChevronDown
          size={12}
          className={cn(
            "text-muted-foreground/50 shrink-0 transition-transform duration-150",
            anchorRect && "rotate-180"
          )}
        />
      </button>

      {anchorRect && (
        <ServerDropdown
          anchorRect={anchorRect}
          onClose={() => setAnchorRect(null)}
        />
      )}
    </>
  )
}
