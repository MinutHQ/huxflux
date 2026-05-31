import { IconFlask } from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import type { SidebarTab } from "./types"

interface SidebarTabsProps {
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  prReviewEnabled: boolean
  refineEnabled: boolean
  unreadPrCount: number
}

/**
 * Three-way tab strip (Agents / Review / Refine) shown only when either the
 * PR-review or Refine flag is enabled. When both flags are off, the sidebar
 * skips this row and the Agents pane fills the column.
 */
export function SidebarTabs({ tab, onTabChange, prReviewEnabled, refineEnabled, unreadPrCount }: SidebarTabsProps) {
  if (!prReviewEnabled && !refineEnabled) return null

  return (
    <div className="px-2 pt-2 pb-1.5 flex gap-1 shrink-0">
      <button
        onClick={() => onTabChange("agents")}
        className={cn(
          "flex-1 py-1 rounded-md text-[12px] font-medium transition-colors",
          tab === "agents"
            ? "bg-sidebar-accent text-foreground"
            : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent/50"
        )}
      >
        Agents
      </button>
      {prReviewEnabled && (
        <button
          onClick={() => onTabChange("review")}
          className={cn(
            "flex-1 py-1 rounded-md text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5",
            tab === "review"
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent/50"
          )}
        >
          Review
          {unreadPrCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {unreadPrCount}
            </span>
          )}
        </button>
      )}
      {refineEnabled && (
        <button
          onClick={() => onTabChange("refine")}
          className={cn(
            "flex-1 py-1 rounded-md text-[12px] font-medium transition-colors flex items-center justify-center gap-1",
            tab === "refine"
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <IconFlask size={11} />
          Refine
        </button>
      )}
    </div>
  )
}
