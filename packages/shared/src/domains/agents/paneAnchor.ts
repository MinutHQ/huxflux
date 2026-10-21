/** Side of a reference a pane sits on, or `within` for a tab in the same group. */
export type PaneDirection = "left" | "right" | "above" | "below" | "within"

/**
 * Where a docked pane sat when it was hidden, so it can come back to the same
 * spot. `ref` is the pane it was positioned against, or null for the outer
 * edge of the whole layout (e.g. a bottom pane spanning the full width).
 */
export interface PaneAnchor {
  ref: string | null
  direction: PaneDirection
  /** Tab index, only meaningful for `within`. */
  index?: number
}

export interface PaneRect {
  top: number
  left: number
  bottom: number
  right: number
}

/** What a pane's surroundings looked like at the moment it was hidden. */
export interface PaneSite {
  /** The other panes sharing its tab group, in tab order. */
  tabSiblings: string[]
  /** Its own tab index in the group. */
  index: number
  rect: PaneRect
  container: PaneRect
  /** The visible pane and bounds of the adjacent group in each direction, when there is one. */
  neighbors: Partial<Record<"up" | "down" | "left" | "right", { id: string; rect: PaneRect }>>
}

const edgeTolerance = 2

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= edgeTolerance
}

/**
 * Describes a pane's spot relative to what will still be on screen after it
 * is hidden: a tab next to its siblings, a full-width or full-height strip
 * along an outer edge, or a split beside an adjacent group (preferring one
 * whose edge lines up exactly, then up, left, down, right). Null when the
 * pane is the only thing in the layout.
 */
export function derivePaneAnchor(site: PaneSite): PaneAnchor | null {
  const sibling = site.tabSiblings[0]
  if (sibling !== undefined) return { ref: sibling, direction: "within", index: site.index }

  const { rect, container } = site
  const top = near(rect.top, container.top)
  const bottom = near(rect.bottom, container.bottom)
  const left = near(rect.left, container.left)
  const right = near(rect.right, container.right)
  if (left && right && bottom && !top) return { ref: null, direction: "below" }
  if (left && right && top && !bottom) return { ref: null, direction: "above" }
  if (top && bottom && right && !left) return { ref: null, direction: "right" }
  if (top && bottom && left && !right) return { ref: null, direction: "left" }

  // A neighbour that shares the whole edge is the one the pane was split off
  // from, so it wins over one that merely touches part of the edge.
  const sides = [
    { side: "up", direction: "below", aligned: (n: PaneRect) => near(n.left, rect.left) && near(n.right, rect.right) },
    { side: "left", direction: "right", aligned: (n: PaneRect) => near(n.top, rect.top) && near(n.bottom, rect.bottom) },
    { side: "down", direction: "above", aligned: (n: PaneRect) => near(n.left, rect.left) && near(n.right, rect.right) },
    { side: "right", direction: "left", aligned: (n: PaneRect) => near(n.top, rect.top) && near(n.bottom, rect.bottom) },
  ] as const
  const present = sides.flatMap((s) => {
    const n = site.neighbors[s.side]
    return n ? [{ ...s, neighbor: n }] : []
  })
  const pick = present.find((s) => s.aligned(s.neighbor.rect)) ?? present[0]
  return pick ? { ref: pick.neighbor.id, direction: pick.direction } : null
}

/**
 * Picks where a pane reappears. Its saved anchor wins when the referenced
 * pane is on screen; when that pane is hidden too, the pane takes over the
 * hidden pane's own saved spot, following the chain until something visible
 * (or the layout edge) is found. Falls back to `fallback` when the chain
 * breaks or loops; the caller must make `fallback` always resolvable.
 */
export function resolvePaneAnchor<A extends PaneAnchor>(
  pane: string,
  anchors: Readonly<Record<string, NoInfer<A> | undefined>>,
  present: ReadonlySet<string>,
  fallback: A,
): A {
  const seen = new Set([pane])
  let anchor = anchors[pane]
  while (anchor) {
    if (anchor.ref === null || present.has(anchor.ref)) return anchor
    if (seen.has(anchor.ref)) break
    seen.add(anchor.ref)
    anchor = anchors[anchor.ref]
  }
  return fallback
}
