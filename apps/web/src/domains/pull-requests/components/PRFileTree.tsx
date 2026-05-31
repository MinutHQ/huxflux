import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconCheck, IconChevronRight, IconFolder } from "@tabler/icons-react"
import type { PRTreeEntry } from "../pull-requests.types"
import { buildPRFileTree } from "../utils"

interface PRFileTreeProps {
  files: { path: string; additions: number; deletions: number }[]
  viewedFiles: Set<string>
  onSelect: (path: string) => void
}

/** Right-pane file tree for the Changes tab. Roots are expanded by default. */
export function PRFileTree({ files, viewedFiles, onSelect }: PRFileTreeProps) {
  const tree = buildPRFileTree(files, viewedFiles)
  return (
    <>
      {tree.map((entry) => (
        <PRFileTreeNode key={entry.path} entry={entry} depth={0} onSelect={onSelect} />
      ))}
    </>
  )
}

interface PRFileTreeNodeProps {
  entry: PRTreeEntry
  depth: number
  onSelect: (path: string) => void
}

function PRFileTreeNode({ entry, depth, onSelect }: PRFileTreeNodeProps) {
  const [open, setOpen] = useState(true)

  if (entry.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-1.5 py-[3px] text-left hover:bg-accent/40 transition-colors"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <IconChevronRight
            size={10}
            className={cn("text-muted-foreground/40 shrink-0 transition-transform", open && "rotate-90")}
          />
          <IconFolder size={12} className="text-muted-foreground/50 shrink-0" />
          <span className="text-[11px] text-muted-foreground truncate">{entry.name}</span>
        </button>
        {open &&
          entry.children?.map((child) => (
            <PRFileTreeNode key={child.path} entry={child} depth={depth + 1} onSelect={onSelect} />
          ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className={cn(
        "w-full flex items-center gap-1.5 py-[3px] text-left hover:bg-accent/40 transition-colors",
        entry.viewed && "opacity-50 hover:opacity-100",
      )}
      style={{ paddingLeft: `${20 + depth * 14}px` }}
    >
      {entry.viewed ? (
        <IconCheck size={10} className="text-muted-foreground/40 shrink-0" />
      ) : (
        <span className="text-[9px] text-muted-foreground/30 shrink-0 leading-none">◆</span>
      )}
      <span className="text-[11px] font-mono text-foreground/80 truncate flex-1 min-w-0">{entry.name}</span>
      <div className="flex items-center gap-1 shrink-0 pr-1">
        {(entry.additions ?? 0) > 0 && (
          <span className="text-[9px] font-mono text-emerald-400">+{entry.additions}</span>
        )}
        {(entry.deletions ?? 0) > 0 && (
          <span className="text-[9px] font-mono text-red-400">-{entry.deletions}</span>
        )}
      </div>
    </button>
  )
}
