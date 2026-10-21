import type { DockviewApi, IDockviewPanel, SerializedDockview } from "dockview-react"
import { derivePaneAnchor, resolvePaneAnchor, type PaneAnchor, type PaneDirection, type PaneRect, type PaneSite } from "@huxflux/shared"
import type { WorkspacePaneId } from "../agents.types"

const layoutKey = "huxflux:dock-layout"
const anchorsKey = "huxflux:dock-anchors"

export const paneOrder: readonly WorkspacePaneId[] = ["chat", "diff", "files", "pr", "terminal"]

export const paneTitles: Record<WorkspacePaneId, string> = {
  chat: "Chat",
  diff: "Diff",
  files: "Files",
  pr: "Pull request",
  terminal: "Terminal",
}

/**
 * The out-of-the-box arrangement: chat | the first shown of Diff / Files / PR
 * (the others as tabs beside it) over the terminal.
 */
function defaultAnchors(visible: ReadonlySet<WorkspacePaneId>): Record<string, PaneAnchor> {
  const head = (["diff", "files", "pr"] as const).find((p) => visible.has(p))
  if (!head) return { terminal: { ref: "chat", direction: "right" } }
  const anchors: Record<string, PaneAnchor> = { [head]: { ref: "chat", direction: "right" }, terminal: { ref: head, direction: "below" } }
  for (const p of ["diff", "files", "pr"] as const) if (p !== head) anchors[p] = { ref: head, direction: "within" }
  return anchors
}

const fallbackAnchor: StoredAnchor = { ref: "chat", direction: "right" }

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the layout still works for this session */
  }
}

/**
 * A saved anchor plus a counter of when the pane was hidden, so the latest-hidden pane comes back first,
 * and its size along the split as a fraction of the dock, so it comes back as big as it left.
 */
type StoredAnchor = PaneAnchor & { hiddenAt?: number; size?: number }

function isOptionalFraction(v: unknown): boolean {
  return v === undefined || (typeof v === "number" && v > 0 && v < 1)
}

function isOptionalCount(v: unknown): boolean {
  return v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0)
}

function isAnchor(raw: unknown): raw is StoredAnchor {
  if (!raw || typeof raw !== "object") return false
  const r = raw as Record<string, unknown>
  const direction = String(r.direction)
  if (!["left", "right", "above", "below", "within"].includes(direction)) return false
  if (!isOptionalFraction(r.size)) return false
  if (r.ref === null) return direction !== "within" && isOptionalCount(r.hiddenAt)
  return typeof r.ref === "string" && isOptionalCount(r.index) && isOptionalCount(r.hiddenAt)
}

function loadAnchors(): Record<string, StoredAnchor> {
  const raw = readJson(anchorsKey)
  if (!raw || typeof raw !== "object") return {}
  return Object.fromEntries(Object.entries(raw).filter(([, a]) => isAnchor(a))) as Record<string, StoredAnchor>
}

function saveAnchor(id: string, anchor: StoredAnchor | null): void {
  const anchors = loadAnchors()
  const latest = Math.max(0, ...Object.values(anchors).map((a) => a.hiddenAt ?? 0))
  if (anchor) anchors[id] = { ...anchor, hiddenAt: latest + 1 }
  else delete anchors[id]
  writeJson(anchorsKey, anchors)
}

export function saveLayout(api: DockviewApi): void {
  writeJson(layoutKey, api.toJSON())
}

function toRect(r: DOMRect): PaneRect {
  return { top: r.top, left: r.left, bottom: r.bottom, right: r.right }
}

function isHorizontal(direction: PaneDirection): boolean {
  return direction === "left" || direction === "right"
}

/** The group's share of the dock along the axis it was split on; undefined for tabs. */
function splitFraction(anchor: PaneAnchor, rect: PaneRect, container: PaneRect): number | undefined {
  if (anchor.direction === "within") return undefined
  const [own, total] = isHorizontal(anchor.direction)
    ? [rect.right - rect.left, container.right - container.left]
    : [rect.bottom - rect.top, container.bottom - container.top]
  const fraction = total > 0 ? own / total : 0
  return fraction > 0 && fraction < 1 ? fraction : undefined
}

/** Records where `panel` sits, and how big it is, so it can come back to the same spot once removed. */
function capturePaneAnchor(api: DockviewApi, panel: IDockviewPanel, container: HTMLElement): void {
  const group = panel.group
  const neighbors: PaneSite["neighbors"] = {}
  for (const side of ["up", "down", "left", "right"] as const) {
    const near = api.adjacentGroupInDirection(group, side)
    const adjacent = near && api.groups.find((g) => g.id === near.id)
    const id = adjacent?.activePanel?.id
    if (adjacent && id) neighbors[side] = { id, rect: toRect(adjacent.element.getBoundingClientRect()) }
  }
  const rect = toRect(group.element.getBoundingClientRect())
  const bounds = toRect(container.getBoundingClientRect())
  const anchor = derivePaneAnchor({
    tabSiblings: group.panels.filter((p) => p.id !== panel.id).map((p) => p.id),
    index: group.panels.indexOf(panel),
    rect,
    container: bounds,
    neighbors,
  })
  saveAnchor(panel.id, anchor && { ...anchor, size: splitFraction(anchor, rect, bounds) })
}

/** Gives re-added panes back the share of the dock they had when hidden. */
function applySavedSizes(api: DockviewApi, sized: Array<{ id: string; anchor: StoredAnchor }>): void {
  // Before the dock is laid out there is nothing to take a share of; sizing now would squash panes.
  if (api.width <= 0 || api.height <= 0) return
  for (const { id, anchor } of sized) {
    const group = api.getPanel(id)?.group
    if (!group || anchor.size === undefined || anchor.direction === "within") continue
    if (isHorizontal(anchor.direction)) group.api.setSize({ width: Math.round(anchor.size * api.width) })
    else group.api.setSize({ height: Math.round(anchor.size * api.height) })
  }
}

/** Keeps panes usable when squeezed: the chat needs room for messages above its input. */
const paneMinimums = { chat: { minimumWidth: 320, minimumHeight: 240 }, other: { minimumWidth: 200, minimumHeight: 120 } }

function addPane(api: DockviewApi, id: WorkspacePaneId, anchor: PaneAnchor | null): void {
  const base = {
    id,
    component: "pane",
    title: paneTitles[id],
    inactive: id !== "chat" && anchor?.direction === "within",
    ...(id === "chat" ? paneMinimums.chat : paneMinimums.other),
  }
  if (!anchor) { api.addPanel(base); return }
  const position = anchor.ref === null
    ? { direction: anchor.direction }
    : { referencePanel: anchor.ref, direction: anchor.direction, index: anchor.index }
  try {
    api.addPanel({ ...base, position })
  } catch (err) {
    // A stale or odd anchor must not take the workspace down: fall back to beside the chat.
    console.warn(`workspace dock: could not restore ${id}, placing it beside the chat`, err)
    if (!api.getPanel(id)) api.addPanel({ ...base, position: { referencePanel: "chat", direction: "right" } })
  }
}

function groupArea(panel: IDockviewPanel): number {
  return panel.group.width * panel.group.height
}

/**
 * Brings the dock in line with the panes `visible` asks for: removes the rest
 * (remembering their spots) and re-adds missing ones where they last were.
 *
 * Restoring is the reverse of hiding: the pane hidden last comes back first,
 * into the same arrangement it left. When several panes go at once, the
 * smaller (more nested) ones go first so each anchor refers to what remains.
 * Re-added tabs open in the background unless they are `focus`.
 */
export function reconcilePanes(
  api: DockviewApi,
  visible: ReadonlySet<WorkspacePaneId>,
  container: HTMLElement,
  focus?: WorkspacePaneId,
): void {
  const leaving = api.panels.filter((p) => !visible.has(p.id as WorkspacePaneId))
  const arriving = paneOrder.filter((id) => visible.has(id) && !api.getPanel(id))
  // Group rects are meaningless while one group is maximized; anchors need the real layout.
  if ((leaving.length || arriving.length) && api.hasMaximizedGroup()) api.exitMaximizedGroup()
  for (const panel of leaving.sort((a, b) => groupArea(a) - groupArea(b))) {
    capturePaneAnchor(api, panel, container)
    api.removePanel(panel)
  }
  if (!api.getPanel("chat")) addPane(api, "chat", api.panels.length ? { ref: null, direction: "left" } : null)

  const saved = loadAnchors()
  const anchors: Record<string, StoredAnchor> = { ...defaultAnchors(visible), ...saved }
  const sized: Array<{ id: string; anchor: StoredAnchor }> = []
  const missing = paneOrder
    .filter((id) => visible.has(id) && !api.getPanel(id))
    .sort((a, b) => (saved[b]?.hiddenAt ?? -1) - (saved[a]?.hiddenAt ?? -1))
  while (missing.length) {
    const ready = missing.findIndex((id) => { const a = anchors[id]; return !!a && (a.ref === null || !!api.getPanel(a.ref)) })
    const [id] = missing.splice(ready === -1 ? 0 : ready, 1)
    if (!id) break
    const present = new Set(api.panels.map((p) => p.id))
    const anchor = resolvePaneAnchor(id, anchors, present, fallbackAnchor)
    addPane(api, id, anchor)
    // A pane that took over a hidden pane's spot takes its size too; the fallback has none.
    if (anchor !== fallbackAnchor) sized.push({ id, anchor })
  }
  // Applied once everything is back, so a later split does not undo an earlier size.
  applySavedSizes(api, sized)
  if (focus) api.getPanel(focus)?.api.setActive()
}

/** The pane in front of the maximized group, if any. */
export function getMaximizedPane(api: DockviewApi): WorkspacePaneId | undefined {
  return api.groups.find((g) => g.api.isMaximized())?.activePanel?.id as WorkspacePaneId | undefined
}

/** Maximizes `pane`'s group, or restores the layout when `pane` is unset or not in the dock. */
export function applyMaximizedPane(api: DockviewApi, pane: WorkspacePaneId | undefined): void {
  const panel = pane && api.getPanel(pane)
  if (!panel) {
    if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
    return
  }
  panel.api.setActive()
  if (!panel.group.api.isMaximized()) api.maximizeGroup(panel)
}

/** Restores the saved global layout. False when there is none, it no longer loads, or it breaks the dock rules. */
export function restoreLayout(api: DockviewApi): boolean {
  const saved = readJson(layoutKey)
  if (!saved || typeof saved !== "object") return false
  try {
    api.fromJSON(saved as SerializedDockview)
    const knownPanes = api.panels.every((p) => paneOrder.includes(p.id as WorkspacePaneId))
    const chatAlone = (api.getPanel("chat")?.group.panels.length ?? 1) === 1
    return knownPanes && chatAlone
  } catch {
    return false
  }
}

/** Drops every saved position and rebuilds the default arrangement. */
export function resetLayout(api: DockviewApi, visible: ReadonlySet<WorkspacePaneId>, container: HTMLElement): void {
  writeJson(anchorsKey, {})
  api.clear()
  reconcilePanes(api, visible, container)
  saveLayout(api)
}
