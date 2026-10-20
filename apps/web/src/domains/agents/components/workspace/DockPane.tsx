import type { IDockviewPanelProps } from "dockview-react"
import type { WorkspacePaneId } from "../../agents.types"
import { useWorkspacePanes } from "./WorkspacePanesContext"

/** A pane body: looks up its live content by panel id. */
export function DockPane({ api }: IDockviewPanelProps) {
  const { content } = useWorkspacePanes()
  return <div className="flex flex-col h-full min-h-0 bg-card">{content[api.id as WorkspacePaneId]}</div>
}
