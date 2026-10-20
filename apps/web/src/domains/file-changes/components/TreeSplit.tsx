import type { ReactNode } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, cn } from "@huxflux/ui"
import { useDefaultLayout } from "react-resizable-panels"
import { useIsNarrow } from "../hooks/useIsNarrow"

/** Below this pane width the tree moves above the body instead of beside it. */
const STACK_BELOW_PX = 640
/** Tree panel sizes when stacked: heights run shorter than widths, so the tree gets more room. */
const STACKED_TREE_SIZE = { default: "40", min: "15", max: "70" }

export interface TreeSplitProps {
  /** Prefix for the persisted layouts and panel ids. Side-by-side and stacked layouts persist separately. */
  id: string
  tree: ReactNode
  body: ReactNode
  /** Tree panel sizes in percent when side by side. */
  treeSize: { default: string; min: string; max: string }
  bodyMinSize: string
}

/**
 * A file tree next to its content, stacked tree-over-content when the pane gets
 * narrow. Crossing the threshold remounts the group (the panels library only
 * reads orientation and layout on mount), so the body's scroll position resets.
 */
export function TreeSplit({ id, tree, body, treeSize, bodyMinSize }: TreeSplitProps) {
  const [measureRef, stacked] = useIsNarrow(STACK_BELOW_PX)
  const panelIds = [`${id}-list`, `${id}-body`]
  const sideLayout = useDefaultLayout({ id, panelIds })
  const stackedLayout = useDefaultLayout({ id: `${id}-stacked`, panelIds })
  const layout = stacked ? stackedLayout : sideLayout
  const size = stacked ? STACKED_TREE_SIZE : treeSize

  return (
    <div ref={measureRef} className="h-full">
      {stacked !== null && (
        <ResizablePanelGroup
          key={stacked ? "stacked" : "side"}
          orientation={stacked ? "vertical" : "horizontal"}
          className="h-full"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id={panelIds[0]} defaultSize={size.default} minSize={size.min} maxSize={size.max}>
            <div className={cn("h-full border-border/60", stacked ? "border-b" : "border-r")}>{tree}</div>
          </ResizablePanel>
          <ResizableHandle className="w-0 bg-transparent aria-[orientation=horizontal]:h-0" />
          <ResizablePanel id={panelIds[1]} minSize={bodyMinSize}>{body}</ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
