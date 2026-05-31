import React, { useRef, useState } from "react"
import { IconFilter, IconRefresh } from "@tabler/icons-react"
import { Button } from "@huxflux/ui"
import { useMatchRoute, useNavigate } from "@tanstack/react-router"
import type { PullRequest } from "@huxflux/shared"
import { PRList } from "./PRList"
import { PRPopover } from "./PRPopover"
import { PRFilterPopover } from "./PRFilterPopover"

interface PRPaneProps {
  prs: PullRequest[]
  prsLoading: boolean
  onRefetchPRs?: () => void
  /** Container the popover anchors to; used to compute the popover's left offset. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * The Review tab's contents: header (refresh + filter), the list, and the
 * hover popover. Owns the `hideReviewedPrs` toggle (persisted in
 * localStorage) and the selected-PR derivation from the route.
 *
 * Lives in app-shell for now (sidebar chrome). Will move into the
 * `pull-requests` domain in a follow-up commit.
 */
export function PRPane({ prs, prsLoading, onRefetchPRs, containerRef }: PRPaneProps) {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const reviewMatch = matchRoute({ to: "/review/$prId", fuzzy: false }) as { prId: string } | false
  const selectedPrId = reviewMatch ? reviewMatch.prId : null

  const [hoveredPr, setHoveredPr] = useState<{ pr: PullRequest; y: number } | null>(null)
  const [hideReviewedPrs, setHideReviewedPrsRaw] = useState(() => localStorage.getItem("hive:sidebar:hideReviewedPrs") === "true")
  const setHideReviewedPrs = (v: boolean | ((prev: boolean) => boolean)) => {
    setHideReviewedPrsRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      localStorage.setItem("hive:sidebar:hideReviewedPrs", String(next))
      return next
    })
  }
  const [showPrFilter, setShowPrFilter] = useState(false)
  const prFilterBtnRef = useRef<HTMLButtonElement>(null)

  const onSelectPr = (id: string) => navigate({ to: "/review/$prId", params: { prId: id } })

  return (
    <>
      {/* Review header */}
      <div className="px-4 py-2.5 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Pull Requests</span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onRefetchPRs}
              title="Refresh"
            >
              <IconRefresh size={13} />
            </Button>
            <Button
              ref={prFilterBtnRef}
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowPrFilter((v) => !v)}
              className={hideReviewedPrs ? "text-primary" : ""}
              title="Filter"
            >
              <IconFilter size={13} />
            </Button>
          </div>
          {showPrFilter && (
            <PRFilterPopover
              hideReviewed={hideReviewedPrs}
              onToggleHideReviewed={() => setHideReviewedPrs((v) => !v)}
              onClose={() => setShowPrFilter(false)}
              anchorRef={prFilterBtnRef}
            />
          )}
        </div>
      </div>

      {/* PR list */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <PRList
          prsLoading={prsLoading}
          prs={prs}
          hideReviewedPrs={hideReviewedPrs}
          selectedPrId={selectedPrId}
          onSelectPr={onSelectPr}
          onHover={(pr, y) => setHoveredPr({ pr, y })}
          onLeave={() => setHoveredPr(null)}
        />
      </div>

      {hoveredPr && (
        <PRPopover
          pr={hoveredPr.pr}
          y={hoveredPr.y}
          containerRef={containerRef}
        />
      )}
    </>
  )
}
