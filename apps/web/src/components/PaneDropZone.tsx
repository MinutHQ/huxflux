import { useDroppable } from "@dnd-kit/core"
import { cn } from "@huxflux/ui"
import type { ReactNode } from "react"

interface PaneDropZoneProps {
  paneId: string
  children: ReactNode
  isDragging: boolean
}

function EdgeZone({ id, position, isDragging }: { id: string; position: "left" | "right" | "top" | "bottom"; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { position } })

  if (!isDragging) return null

  const positionClass = {
    left: "left-0 top-0 bottom-0 w-[20%]",
    right: "right-0 top-0 bottom-0 w-[20%]",
    top: "top-0 left-0 right-0 h-[20%]",
    bottom: "bottom-0 left-0 right-0 h-[20%]",
  }[position]

  return (
    <div
      ref={setNodeRef}
      className={cn("absolute z-30 transition-colors", positionClass)}
    >
      {isOver && (
        <div className={cn(
          "absolute inset-1 rounded-md border-2 border-dashed border-primary/50 bg-primary/10 transition-all",
          position === "left" && "right-1/2",
          position === "right" && "left-1/2",
          position === "top" && "bottom-1/2",
          position === "bottom" && "top-1/2",
        )} />
      )}
    </div>
  )
}

function CenterZone({ id, isDragging }: { id: string; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { position: "center" } })

  if (!isDragging) return null

  return (
    <div
      ref={setNodeRef}
      className="absolute z-20 inset-[20%]"
    >
      {isOver && (
        <div className="absolute inset-0 rounded-md border-2 border-dashed border-primary/50 bg-primary/10" />
      )}
    </div>
  )
}

export function PaneDropZone({ paneId, children, isDragging }: PaneDropZoneProps) {
  return (
    <div className="relative flex-1 min-w-0 min-h-0 h-full">
      {children}
      <EdgeZone id={`${paneId}:left`} position="left" isDragging={isDragging} />
      <EdgeZone id={`${paneId}:right`} position="right" isDragging={isDragging} />
      <EdgeZone id={`${paneId}:top`} position="top" isDragging={isDragging} />
      <EdgeZone id={`${paneId}:bottom`} position="bottom" isDragging={isDragging} />
      <CenterZone id={`${paneId}:center`} isDragging={isDragging} />
    </div>
  )
}
