import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { AgentPaneView } from "@/components/AgentPaneView"
import { PaneDropZone } from "@/components/PaneDropZone"
import type { PaneNode } from "@/hooks/usePaneLayout"

interface PaneContainerProps {
  node: PaneNode
  focusedPaneId: string
  onFocusPane: (paneId: string) => void
  onClosePane: (paneId: string) => void
  onResizePane: (splitId: string, ratio: number) => void
  paneCount: number
  isDragging?: boolean
}

export function PaneContainer({ node, focusedPaneId, onFocusPane, onClosePane, onResizePane, paneCount, isDragging = false }: PaneContainerProps) {
  if (node.type === "leaf") {
    return (
      <PaneDropZone paneId={node.id} isDragging={isDragging}>
        <AgentPaneView
          agentId={node.agentId}
          paneId={node.id}
          isFocused={node.id === focusedPaneId}
          onFocus={() => onFocusPane(node.id)}
          onClose={paneCount > 1 ? () => onClosePane(node.id) : undefined}
          showCloseButton={paneCount > 1}
        />
      </PaneDropZone>
    )
  }

  return (
    <ResizablePanelGroup
      orientation={node.direction}
      className="flex-1 min-h-0 min-w-0"
      defaultLayout={{ [node.first.id]: `${node.ratio}`, [node.second.id]: `${100 - node.ratio}` }}
      onLayoutChanged={(sizes) => {
        const firstSize = sizes[node.first.id]
        if (firstSize != null) {
          const ratio = Math.round(firstSize.asPercentage)
          onResizePane(node.id, ratio)
        }
      }}
    >
      <ResizablePanel id={node.first.id} defaultSize={`${node.ratio}`} minSize="15">
        <PaneContainer
          node={node.first}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
          onClosePane={onClosePane}
          onResizePane={onResizePane}
          paneCount={paneCount}
          isDragging={isDragging}
        />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id={node.second.id} defaultSize={`${100 - node.ratio}`} minSize="15">
        <PaneContainer
          node={node.second}
          focusedPaneId={focusedPaneId}
          onFocusPane={onFocusPane}
          onClosePane={onClosePane}
          onResizePane={onResizePane}
          paneCount={paneCount}
          isDragging={isDragging}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
