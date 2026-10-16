import { useMemo, useState } from "react"
import { cn } from "@huxflux/ui"
import { IconChevronRight, IconFile } from "@tabler/icons-react"
import { buildChangedFileTree, flattenChangedTree, type FileChange } from "@huxflux/shared"
import { fileColor } from "../../utils"

interface ChangedFilesTreeProps {
  files: FileChange[]
  activePath: string | null
  onSelect: (path: string) => void
}

/** Left column of the diff pane: changed files grouped by folder with +/- counts. */
export function ChangedFilesTree({ files, activePath, onSelect }: ChangedFilesTreeProps) {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const rows = useMemo(
    () => flattenChangedTree(buildChangedFileTree(files), collapsedDirs),
    [files, collapsedDirs],
  )

  function toggleDir(path: string) {
    setCollapsedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="py-1 text-[12px]">
      {rows.map(({ node, depth }) => {
        const isDir = node.type === "directory"
        const isActive = !isDir && node.path === activePath
        return (
          <button
            key={`${node.type}:${node.path}`}
            onClick={() => (isDir ? toggleDir(node.path) : onSelect(node.path))}
            className={cn(
              "w-full flex items-center gap-1.5 h-6 pr-2 text-left transition-colors",
              isActive ? "bg-accent text-foreground" : "text-foreground/85 hover:bg-accent/50",
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
            title={node.path}
          >
            {isDir ? (
              <IconChevronRight
                size={12}
                className={cn("shrink-0 text-muted-foreground transition-transform", !collapsedDirs.has(node.path) && "rotate-90")}
              />
            ) : (
              <IconFile size={12} className={cn("shrink-0", fileColor(node.name))} />
            )}
            <span className={cn("truncate flex-1 min-w-0", isDir && "text-muted-foreground")}>{node.name}</span>
            {!isDir && (
              <span className="shrink-0 font-mono text-[10px] tabular-nums">
                <span className="text-emerald-500">+{node.additions}</span>
                <span className="text-red-500 ml-1">-{node.deletions}</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
