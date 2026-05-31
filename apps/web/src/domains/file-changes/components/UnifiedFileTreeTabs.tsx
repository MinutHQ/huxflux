import { Button, cn } from "@huxflux/ui"
import { IconArrowUpRight, IconGitPullRequest } from "@tabler/icons-react"

interface UnifiedFileTreeTabsProps {
  activeView: "all" | "diff" | "pr"
  fileChangesCount: number
  hasPR: boolean
  onSwitchToAll: () => void
  onSwitchToDiff: () => void
  onSwitchToPR: () => void
  onOpenDiffBrowser?: (scrollToPath?: string) => void
  onOpenPRTab?: () => void
}

/** Top tab bar inside `UnifiedFileTree` (All / Diff / PR). */
export function UnifiedFileTreeTabs({
  activeView,
  fileChangesCount,
  hasPR,
  onSwitchToAll,
  onSwitchToDiff,
  onSwitchToPR,
  onOpenDiffBrowser,
  onOpenPRTab,
}: UnifiedFileTreeTabsProps) {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 shrink-0">
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <button
          onClick={onSwitchToAll}
          className={cn(
            "px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
            activeView === "all"
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
          )}
        >
          All files
        </button>
        <button
          onClick={onSwitchToDiff}
          onDoubleClick={(e) => { e.preventDefault(); onOpenDiffBrowser?.() }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
            activeView === "diff"
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
          )}
        >
          Diff
          {fileChangesCount > 0 && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                activeView === "diff" ? "bg-background/60 text-foreground" : "bg-accent/60 text-muted-foreground",
              )}
            >
              {fileChangesCount}
            </span>
          )}
        </button>
        {hasPR && (
          <button
            onClick={onSwitchToPR}
            onDoubleClick={(e) => { e.preventDefault(); onOpenPRTab?.() }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              activeView === "pr"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
            )}
          >
            <IconGitPullRequest size={12} />
            PR
          </button>
        )}
      </div>

      {activeView === "diff" && onOpenDiffBrowser && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon-xs" title="Open in full view" onClick={() => onOpenDiffBrowser()}>
            <IconArrowUpRight size={13} />
          </Button>
        </div>
      )}
    </div>
  )
}
