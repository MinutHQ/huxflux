import { StateEffect, StateField, type Extension } from "@codemirror/state"
import { Decoration, EditorView, GutterMarker, WidgetType, gutter, type DecorationSet } from "@codemirror/view"

/**
 * Line comments in the editor:
 *  - a narrow gutter left of the line numbers that shows a `+` on the hovered
 *    line (click to comment) and a dot on lines that already have a comment
 *  - block widgets under commented lines whose DOM nodes are handed to React
 *    through a `PortalRegistry`, so the bubble and the composer are normal
 *    React components rendered with `createPortal`
 */

export interface CommentWidgetSpec {
  key: string
  line: number
}

/** Hands widget container elements from CodeMirror to React. */
export class PortalRegistry {
  private els = new Map<string, HTMLElement>()
  private snapshot = new Map<string, HTMLElement>()
  private listeners = new Set<() => void>()

  attach(key: string, el: HTMLElement): void {
    this.els.set(key, el)
    this.emit()
  }

  detach(key: string, el: HTMLElement): void {
    if (this.els.get(key) !== el) return
    this.els.delete(key)
    this.emit()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getSnapshot = (): Map<string, HTMLElement> => this.snapshot

  private emit(): void {
    this.snapshot = new Map(this.els)
    for (const fn of this.listeners) fn()
  }
}

const setHoverLine = StateEffect.define<number | null>()
export const setCommentLines = StateEffect.define<number[]>()
export const setCommentWidgets = StateEffect.define<CommentWidgetSpec[]>()

const hoverLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHoverLine)) value = e.value
    return value
  },
})

const commentLinesField = StateField.define<ReadonlySet<number>>({
  create: () => new Set(),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setCommentLines)) value = new Set(e.value)
    return value
  },
})

class AddMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div")
    el.className = "cm-comment-add"
    el.textContent = "+"
    el.title = "Comment on this line"
    return el
  }
}

class DotMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div")
    el.className = "cm-comment-dot"
    return el
  }
}

const addMarker = new AddMarker()
const dotMarker = new DotMarker()

class PortalWidget extends WidgetType {
  readonly key: string
  readonly registry: PortalRegistry
  constructor(key: string, registry: PortalRegistry) {
    super()
    this.key = key
    this.registry = registry
  }
  eq(other: PortalWidget) { return other.key === this.key }
  toDOM() {
    const el = document.createElement("div")
    el.className = "cm-comment-widget"
    this.registry.attach(this.key, el)
    return el
  }
  destroy(el: HTMLElement) { this.registry.detach(this.key, el) }
  ignoreEvent() { return true }
  get estimatedHeight() { return 64 }
}

function lineFromEvent(view: EditorView, e: MouseEvent): number | null {
  const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false)
  return view.state.doc.lineAt(pos).number
}

function hover(view: EditorView, line: number | null): void {
  if (view.state.field(hoverLineField) !== line) view.dispatch({ effects: setHoverLine.of(line) })
}

/** Build the comment gutter + widget extensions. `onAdd` fires with a 1-based line number. */
export function commentExtensions(registry: PortalRegistry, onAdd: (line: number) => void): Extension {
  const widgets = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes)
      for (const e of tr.effects) {
        if (!e.is(setCommentWidgets)) continue
        const doc = tr.state.doc
        const ranges = e.value
          .filter((s) => s.line >= 1 && s.line <= doc.lines)
          .sort((a, b) => a.line - b.line)
          .map((s) => Decoration.widget({ widget: new PortalWidget(s.key, registry), block: true, side: 1 }).range(doc.line(s.line).to))
        deco = Decoration.set(ranges, true)
      }
      return deco
    },
    provide: (f) => EditorView.decorations.from(f),
  })

  return [
    hoverLineField,
    commentLinesField,
    widgets,
    gutter({
      class: "cm-comment-gutter",
      lineMarker(view, line) {
        const n = view.state.doc.lineAt(line.from).number
        if (view.state.field(commentLinesField).has(n)) return dotMarker
        return view.state.field(hoverLineField) === n ? addMarker : null
      },
      lineMarkerChange: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(setHoverLine) || e.is(setCommentLines))),
      initialSpacer: () => addMarker,
      domEventHandlers: {
        mousedown(view, line) {
          onAdd(view.state.doc.lineAt(line.from).number)
          return true
        },
        mousemove(view, line) {
          hover(view, view.state.doc.lineAt(line.from).number)
          return false
        },
      },
    }),
    EditorView.domEventHandlers({
      mousemove(e, view) { hover(view, lineFromEvent(view, e)) },
      mouseleave(_e, view) { hover(view, null) },
    }),
  ]
}
