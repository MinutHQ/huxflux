import { Button } from "@huxflux/ui"
import { IconArrowsDiagonal, IconArrowsDiagonalMinimize2, IconX } from "@tabler/icons-react"

interface PaneWindowControlsProps {
  maximized: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

/** Maximize / close buttons at the right end of every side-pane section header. */
export function PaneWindowControls({ maximized, onToggleMaximize, onClose }: PaneWindowControlsProps) {
  return (
    <>
      <Button variant="ghost" size="icon-xs" onClick={onToggleMaximize} title={maximized ? "Restore" : "Maximize"}>
        {maximized ? <IconArrowsDiagonalMinimize2 size={14} /> : <IconArrowsDiagonal size={14} />}
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close">
        <IconX size={14} />
      </Button>
    </>
  )
}
