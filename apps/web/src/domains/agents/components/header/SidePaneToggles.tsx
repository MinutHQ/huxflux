import { Button, cn } from "@huxflux/ui"
import { IconFileDiff, IconFolder, IconGitPullRequest, IconTerminal2 } from "@tabler/icons-react"
import type { SidePaneLayout, SidePaneSection } from "../../agents.types"

interface SidePaneTogglesProps {
  layout: SidePaneLayout
  showPR: boolean
  onToggleTop: (section: SidePaneSection) => void
  onToggleTerminal: () => void
}

/** Header buttons that open and close the side pane's sections. */
export function SidePaneToggles({ layout, showPR, onToggleTop, onToggleTerminal }: SidePaneTogglesProps) {
  const item = (active: boolean, title: string, onClick: () => void, icon: React.ReactNode) => (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(active ? "bg-accent text-foreground" : "text-muted-foreground")}
    >
      {icon}
    </Button>
  )
  return (
    <div className="flex items-center gap-0.5">
      {item(layout.top === "diff", "Diff", () => onToggleTop("diff"), <IconFileDiff size={14} />)}
      {item(layout.top === "files", "Files", () => onToggleTop("files"), <IconFolder size={14} />)}
      {showPR && item(layout.top === "pr", "Pull request", () => onToggleTop("pr"), <IconGitPullRequest size={14} />)}
      {item(layout.terminal, "Terminal (⌘J)", onToggleTerminal, <IconTerminal2 size={14} />)}
    </div>
  )
}
