import type { IDockviewPanelHeaderProps } from "dockview-react"

/** A tab: the title only. Closing goes through the header actions so per-agent state stays in sync. */
export function DockTab({ api }: IDockviewPanelHeaderProps) {
  return <span className="px-3 text-[12px] font-medium truncate">{api.title}</span>
}
