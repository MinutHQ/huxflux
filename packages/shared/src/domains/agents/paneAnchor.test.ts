import { describe, it, expect } from "vitest"
import { derivePaneAnchor, resolvePaneAnchor, type PaneAnchor, type PaneSite } from "./paneAnchor.js"

const container = { top: 0, left: 0, bottom: 800, right: 1200 }

function site(overrides: Partial<PaneSite>): PaneSite {
  return {
    tabSiblings: [],
    index: 0,
    rect: { top: 0, left: 600, bottom: 400, right: 1200 },
    container,
    neighbors: {},
    ...overrides,
  }
}

describe("derivePaneAnchor", () => {
  it("anchors a tab to its first sibling and keeps its index", () => {
    expect(derivePaneAnchor(site({ tabSiblings: ["diff", "pr"], index: 2 }))).toEqual({ ref: "diff", direction: "within", index: 2 })
  })

  it("prefers the tab sibling over neighbours and edges", () => {
    const anchor = derivePaneAnchor(site({
      tabSiblings: ["files"],
      rect: { top: 500, left: 0, bottom: 800, right: 1200 },
      neighbors: { up: { id: "chat", rect: container } },
    }))
    expect(anchor).toEqual({ ref: "files", direction: "within", index: 0 })
  })

  it("anchors a full-width strip along the bottom edge to the layout", () => {
    const anchor = derivePaneAnchor(site({ rect: { top: 500, left: 0, bottom: 800, right: 1200 }, neighbors: { up: { id: "chat", rect: container } } }))
    expect(anchor).toEqual({ ref: null, direction: "below" })
  })

  it("anchors a full-width strip along the top edge to the layout", () => {
    expect(derivePaneAnchor(site({ rect: { top: 0, left: 0, bottom: 300, right: 1200 } }))).toEqual({ ref: null, direction: "above" })
  })

  it("anchors a full-height column on the right edge to the layout", () => {
    const anchor = derivePaneAnchor(site({ rect: { top: 0, left: 700, bottom: 800, right: 1200 }, neighbors: { left: { id: "chat", rect: container } } }))
    expect(anchor).toEqual({ ref: null, direction: "right" })
  })

  it("anchors a full-height column on the left edge to the layout", () => {
    expect(derivePaneAnchor(site({ rect: { top: 0, left: 0, bottom: 800, right: 400 } }))).toEqual({ ref: null, direction: "left" })
  })

  it("tolerates sub-pixel gaps when matching an edge", () => {
    const anchor = derivePaneAnchor(site({ rect: { top: 501, left: 1.5, bottom: 798.5, right: 1199 } }))
    expect(anchor).toEqual({ ref: null, direction: "below" })
  })

  it("places a pane under only the chat below the group above it", () => {
    const anchor = derivePaneAnchor(site({
      rect: { top: 500, left: 0, bottom: 800, right: 600 },
      neighbors: { up: { id: "chat", rect: { top: 0, left: 0, bottom: 496, right: 600 } }, right: { id: "terminal", rect: { top: 0, left: 604, bottom: 800, right: 1200 } } },
    }))
    expect(anchor).toEqual({ ref: "chat", direction: "below" })
  })

  it("prefers the neighbour whose edge lines up over an earlier partial one", () => {
    // A pane stacked above the terminal in the right column, with the full-height chat to its left.
    const anchor = derivePaneAnchor(site({
      rect: { top: 0, left: 600, bottom: 400, right: 1000 },
      neighbors: {
        left: { id: "chat", rect: { top: 0, left: 0, bottom: 800, right: 596 } },
        down: { id: "terminal", rect: { top: 404, left: 600, bottom: 800, right: 1000 } },
        right: { id: "pr", rect: { top: 0, left: 1004, bottom: 800, right: 1200 } },
      },
    }))
    expect(anchor).toEqual({ ref: "terminal", direction: "above" })
  })

  it("falls through neighbours in up, left, down, right order when none line up", () => {
    const inner = { top: 200, left: 200, bottom: 400, right: 400 }
    const n = (id: string) => ({ id, rect: container })
    expect(derivePaneAnchor(site({ rect: inner, neighbors: { left: n("a"), down: n("b"), right: n("c") } }))).toEqual({ ref: "a", direction: "right" })
    expect(derivePaneAnchor(site({ rect: inner, neighbors: { down: n("b"), right: n("c") } }))).toEqual({ ref: "b", direction: "above" })
    expect(derivePaneAnchor(site({ rect: inner, neighbors: { right: n("c") } }))).toEqual({ ref: "c", direction: "left" })
  })

  it("returns null for the only group in the layout", () => {
    expect(derivePaneAnchor(site({ rect: container }))).toBeNull()
  })
})

describe("resolvePaneAnchor", () => {
  const fallback: PaneAnchor = { ref: "chat", direction: "right" }

  it("uses the saved anchor when its reference is on screen", () => {
    const anchors = { files: { ref: "diff", direction: "within" as const, index: 1 } }
    expect(resolvePaneAnchor("files", anchors, new Set(["chat", "diff"]), fallback)).toEqual(anchors.files)
  })

  it("uses an edge anchor regardless of what is on screen", () => {
    const anchors = { terminal: { ref: null, direction: "below" as const } }
    expect(resolvePaneAnchor("terminal", anchors, new Set(["chat"]), fallback)).toEqual(anchors.terminal)
  })

  it("follows a hidden reference to that pane's own saved spot", () => {
    const anchors: Record<string, PaneAnchor> = {
      files: { ref: "diff", direction: "within", index: 1 },
      diff: { ref: "chat", direction: "right" },
    }
    expect(resolvePaneAnchor("files", anchors, new Set(["chat", "terminal"]), fallback)).toEqual(anchors.diff)
  })

  it("falls back when there is no saved anchor", () => {
    expect(resolvePaneAnchor("pr", {}, new Set(["chat"]), fallback)).toBe(fallback)
  })

  it("falls back when the chain ends at a hidden pane without an anchor", () => {
    const anchors = { files: { ref: "diff", direction: "within" as const } }
    expect(resolvePaneAnchor("files", anchors, new Set(["chat"]), fallback)).toBe(fallback)
  })

  it("falls back on a cycle of hidden panes", () => {
    const anchors: Record<string, PaneAnchor> = {
      files: { ref: "diff", direction: "within" },
      diff: { ref: "files", direction: "within" },
    }
    expect(resolvePaneAnchor("files", anchors, new Set(["chat"]), fallback)).toBe(fallback)
  })

  it("falls back when the anchor points at the pane itself", () => {
    const anchors = { files: { ref: "files", direction: "within" as const } }
    expect(resolvePaneAnchor("files", anchors, new Set(["chat"]), fallback)).toBe(fallback)
  })
})
