import { cn } from "@huxflux/ui"
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react"
import type { FileChange } from "@huxflux/shared"

interface StackedDiffSidebarProps {
  files: FileChange[]
  expandedFiles: Set<string>
  activeFile: string | null
  onJumpTo: (path: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
}

/** Right-hand "Files" sidebar inside `StackedDiffView`; jumps to and reveals each diff. */
export function StackedDiffSidebar({
  files,
  expandedFiles,
  activeFile,
  onJumpTo,
  onExpandAll,
  onCollapseAll,
}: StackedDiffSidebarProps) {
  return (
    <div className="w-48 shrink-0 border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-0.5">
          <button onClick={onExpandAll} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expand all">
            <IconChevronDown size={12} />
          </button>
          <button onClick={onCollapseAll} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Collapse all">
            <IconChevronRight size={12} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="py-1">
          {files.map((file) => {
            const name = file.path.split("/").pop() ?? file.path
            const isAddOnly = file.deletions === 0
            const isDelOnly = file.additions === 0
            const isExpanded = expandedFiles.has(file.path)
            return (
              <button
                key={file.path}
                onClick={() => onJumpTo(file.path)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-2.5 py-1 text-left transition-colors",
                  activeFile === file.path
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isAddOnly ? "bg-emerald-400" : isDelOnly ? "bg-red-400" : "bg-amber-400",
                  )}
                />
                <span className={cn("text-[11px] truncate", isExpanded && "font-medium")}>{name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
