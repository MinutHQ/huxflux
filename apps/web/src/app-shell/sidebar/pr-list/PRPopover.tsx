import React from "react"
import { createPortal } from "react-dom"
import { IconGitBranch, IconGitPullRequest } from "@tabler/icons-react"
import type { PullRequest } from "@huxflux/shared"

interface PRPopoverProps {
  pr: PullRequest
  y: number
  /** Sidebar container — the popover pins to the right edge using its width. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Read-only hover card pinned to the right of the sidebar when the user hovers
 * a PR row. Mirrors the agent popover layout for consistency.
 *
 * Lives in app-shell for now (sidebar chrome). Will move into the
 * `pull-requests` domain in a follow-up commit.
 */
export function PRPopover({ pr, y, containerRef }: PRPopoverProps) {
  // Reading the container rect during render is intentional — the container is
  // already mounted (we wouldn't be rendering without it) and the popover needs
  // the width to position itself.
  // eslint-disable-next-line react-hooks/refs
  const sidebarWidth = containerRef.current?.getBoundingClientRect().width ?? 0
  return createPortal(
    <div
      className="fixed z-50 w-72 bg-card border border-border rounded-xl shadow-xl p-3 pointer-events-none"
      style={{ left: sidebarWidth + 4, top: Math.max(8, y - 8) }}
    >
      <div className="flex items-start gap-2 mb-2">
        <IconGitPullRequest size={13} className="text-muted-foreground/50 mt-0.5 shrink-0" />
        <span className="text-[13px] font-medium text-foreground leading-snug">
          {pr.title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="font-mono text-muted-foreground/50">#{pr.number}</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{pr.author}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="text-muted-foreground/60">{pr.requestedAt}</span>
      </div>
      {pr.branch && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/50">
          <IconGitBranch size={11} className="shrink-0" />
          {pr.branch}
        </div>
      )}
    </div>,
    document.body
  )
}
