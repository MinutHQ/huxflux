import React, { useState } from "react"
import { IconChevronRight, IconCheck } from "@tabler/icons-react"
import { AnchoredPopover, cn } from "@huxflux/ui"
import type { GroupByMode } from "../../agents.types"

interface FilterPopoverProps {
  groupBy: GroupByMode
  onGroupByChange: (mode: GroupByMode) => void
  repoFilter: string
  onRepoFilterChange: (repoId: string) => void
  repos: { id: string; name: string }[]
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * Floating settings panel opened by the filter button. Two controls:
 *  - Group by: status | repo
 *  - Repo filter: "all" or a specific repo id
 *
 * Both controls render as compact dropdowns that toggle one at a time
 * (opening one collapses the other) to keep the popover from overflowing.
 */
export function FilterPopover({
  groupBy,
  onGroupByChange,
  repoFilter,
  onRepoFilterChange,
  repos,
  onClose,
  anchorRef,
}: FilterPopoverProps) {
  const [groupByOpen, setGroupByOpen] = useState(false)
  const [repoOpen, setRepoOpen] = useState(false)

  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      onClose={onClose}
      placement="bottom-start"
      offset={6}
      crossOffset={-100}
      className="w-64 p-3 space-y-3"
    >
      {/* Group by */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">Group by</span>
        <div className="relative">
          <button
            onClick={() => { setGroupByOpen(!groupByOpen); setRepoOpen(false) }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-[12px] font-medium text-foreground hover:bg-accent/60 transition-colors min-w-[90px] justify-between"
          >
            {groupBy === "status" ? "Status" : "Repo"}
            <IconChevronRight size={10} className={cn("text-muted-foreground/60 transition-transform", groupByOpen && "rotate-90")} />
          </button>
          {groupByOpen && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
              {(["status", "repo"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => { onGroupByChange(mode); setGroupByOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent/60 transition-colors"
                >
                  {groupBy === mode ? <IconCheck size={12} /> : <span className="w-3" />}
                  {mode === "status" ? "Status" : "Repo"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Repo filter */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">Repo</span>
        <div className="relative">
          <button
            onClick={() => { setRepoOpen(!repoOpen); setGroupByOpen(false) }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-[12px] font-medium text-foreground hover:bg-accent/60 transition-colors min-w-[90px] justify-between"
          >
            <span className="truncate">
              {repoFilter === "all" ? "All repos" : repos.find((r) => r.id === repoFilter)?.name ?? "All repos"}
            </span>
            <IconChevronRight size={10} className={cn("text-muted-foreground/60 transition-transform", repoOpen && "rotate-90")} />
          </button>
          {repoOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
              <button
                onClick={() => { onRepoFilterChange("all"); setRepoOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent/60 transition-colors"
              >
                {repoFilter === "all" ? <IconCheck size={12} /> : <span className="w-3" />}
                All repos
              </button>
              {repos.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { onRepoFilterChange(r.id); setRepoOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent/60 transition-colors"
                >
                  {repoFilter === r.id ? <IconCheck size={12} /> : <span className="w-3" />}
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AnchoredPopover>
  )
}
