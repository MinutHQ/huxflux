import { useEffect, useState } from "react"
import type { IDockviewHeaderActionsProps } from "dockview-react"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconArrowsDiagonal, IconArrowsDiagonalMinimize2, IconDots, IconLayoutBoardSplit, IconX } from "@tabler/icons-react"
import type { WorkspacePaneId } from "../../agents.types"
import { useWorkspacePanes } from "./WorkspacePanesContext"

/** Right end of a group's tab strip: layout menu, maximize, and close for the tab in front. */
export function DockHeaderActions({ activePanel, group, containerApi }: IDockviewHeaderActionsProps) {
  const { ui } = useWorkspacePanes()
  const [maximized, setMaximized] = useState(() => group.api.isMaximized())
  useEffect(() => {
    const sub = containerApi.onDidMaximizedGroupChange(() => setMaximized(group.api.isMaximized()))
    return () => sub.dispose()
  }, [containerApi, group])

  const pane = activePanel?.id as WorkspacePaneId | undefined
  if (!pane) return null
  return (
    <div className="flex items-center gap-0.5 h-full pr-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-xs" title="Layout options">
            <IconDots size={14} />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-40 p-1">
          <button
            onClick={ui.reset}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <IconLayoutBoardSplit size={14} className="text-muted-foreground" /> Reset layout
          </button>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon-xs" onClick={() => ui.toggleMaximize(pane)} title={maximized ? "Restore" : "Maximize"}>
        {maximized ? <IconArrowsDiagonalMinimize2 size={14} /> : <IconArrowsDiagonal size={14} />}
      </Button>
      {pane !== "chat" && (
        <Button variant="ghost" size="icon-xs" onClick={() => ui.hide(pane)} title="Close">
          <IconX size={14} />
        </Button>
      )}
    </div>
  )
}
