import React from "react"
import { IconCheck } from "@tabler/icons-react"
import { AnchoredPopover, cn } from "@huxflux/ui"

interface PRFilterPopoverProps {
  hideReviewed: boolean
  onToggleHideReviewed: () => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * Tiny floating panel with a single checkbox: "Hide PRs ready to merge".
 * Persistence lives one level up so the choice survives reloads.
 */
export function PRFilterPopover({ hideReviewed, onToggleHideReviewed, onClose, anchorRef }: PRFilterPopoverProps) {
  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      onClose={onClose}
      placement="bottom-end"
      offset={6}
      className="w-56 p-3 space-y-2"
    >
      <button
        onClick={onToggleHideReviewed}
        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left"
      >
        <div className={cn(
          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
          hideReviewed ? "bg-primary border-primary" : "border-border bg-background"
        )}>
          {hideReviewed && <IconCheck size={10} className="text-primary-foreground" />}
        </div>
        <span className="text-[12px] text-foreground">Hide PRs ready to merge</span>
      </button>
    </AnchoredPopover>
  )
}
