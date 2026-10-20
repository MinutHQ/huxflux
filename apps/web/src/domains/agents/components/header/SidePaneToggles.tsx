import { Button, cn } from "@huxflux/ui"
import { IconFileDiff, IconFolder, IconGitPullRequest, IconTerminal2 } from "@tabler/icons-react"
import type { SidePaneId, WorkspacePaneId } from "../../agents.types"

interface SidePaneTogglesProps {
  visible: ReadonlySet<WorkspacePaneId>
  showDiff: boolean
  showPR: boolean
  onToggle: (pane: SidePaneId) => void
}

/** Header buttons that open and close the workspace's dockable panes. */
export function SidePaneToggles({ visible, showDiff, showPR, onToggle }: SidePaneTogglesProps) {
  const item = (pane: SidePaneId, title: string, icon: React.ReactNode) => (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => onToggle(pane)}
      title={title}
      aria-pressed={visible.has(pane)}
      className={cn(visible.has(pane) ? "bg-accent text-foreground" : "text-muted-foreground")}
    >
      {icon}
    </Button>
  )
  return (
    <div className="flex items-center gap-0.5">
      {showDiff && item("diff", "Diff", <IconFileDiff size={14} />)}
      {item("files", "Files", <IconFolder size={14} />)}
      {showPR && item("pr", "Pull request", <IconGitPullRequest size={14} />)}
      {item("terminal", "Terminal (⌘J)", <IconTerminal2 size={14} />)}
    </div>
  )
}
