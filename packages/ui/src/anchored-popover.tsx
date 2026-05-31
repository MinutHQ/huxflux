"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "./utils"

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end"

interface AnchoredPopoverProps {
  /** Element the popover positions itself relative to. */
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  /** Where to place the popover relative to the anchor. Default "bottom-start". */
  placement?: Placement
  /** Gap between anchor and popover along the main axis, in px. Default 8. */
  offset?: number
  /** Cross-axis nudge (left for *-start, right for *-end), in px. Default 0. */
  crossOffset?: number
  /** Classes on the popover container (sets width, padding, max-height, etc.). */
  className?: string
  /** Optional onKeyDown forwarded to the popover container. */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
  children: React.ReactNode
}

/**
 * Lightweight floating panel positioned relative to a trigger element. Renders
 * into `document.body` with a transparent backdrop that closes on outside click.
 *
 * Why not radix Popover? This wrapper centralises the manual
 * `getBoundingClientRect()` pattern used by popovers that need: bespoke
 * positioning (e.g. right-edge alignment), a backdrop that absorbs all clicks,
 * and no animation/focus-trap baggage. Reading the anchor's rect during render
 * is intentional and lint-suppressed in one place here.
 */
export function AnchoredPopover({
  anchorRef,
  onClose,
  placement = "bottom-start",
  offset = 8,
  crossOffset = 0,
  className,
  onKeyDown,
  children,
}: AnchoredPopoverProps) {
  // Anchor-driven popover: reading the anchor's rect during render is intentional —
  // the popover positions itself relative to the trigger that's already mounted.
  // eslint-disable-next-line react-hooks/refs
  const rect = anchorRef.current?.getBoundingClientRect()
  const style = computeStyle(rect, placement, offset, crossOffset)

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={cn(
          "fixed z-50 bg-card border border-border rounded-xl shadow-xl",
          className,
        )}
        style={style}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

function computeStyle(
  rect: DOMRect | undefined,
  placement: Placement,
  offset: number,
  crossOffset: number,
): React.CSSProperties {
  if (!rect) return { top: 100, left: 100 }

  switch (placement) {
    case "bottom-start":
      return {
        top: rect.bottom + offset,
        left: Math.max(8, rect.left + crossOffset),
      }
    case "bottom-end":
      return {
        top: rect.bottom + offset,
        right: Math.max(8, window.innerWidth - rect.right + crossOffset),
      }
    case "top-start":
      return {
        bottom: window.innerHeight - rect.top + offset,
        left: Math.max(8, rect.left + crossOffset),
      }
    case "top-end":
      return {
        bottom: window.innerHeight - rect.top + offset,
        right: Math.max(8, window.innerWidth - rect.right + crossOffset),
      }
  }
}
