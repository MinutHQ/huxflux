import { useEffect, useMemo, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, cn } from "@huxflux/ui"
import { IconChevronRight, IconCopy, IconDownload, IconFile } from "@tabler/icons-react"
import { toast } from "sonner"
import type { FileChange } from "@huxflux/shared"
import { fileColor } from "../../utils"
import type { useDirectoryTree } from "../../hooks/useDirectoryTree"

interface DirectoryTreeProps {
  tree: ReturnType<typeof useDirectoryTree>
  activePath: string | null
  fileChanges: FileChange[]
  onOpen: (path: string, pin: boolean) => void
  onDownload: (path: string) => void
}

const ROW_HEIGHT = 24

/** Virtualised, lazily loaded worktree tree. Ignored entries are dimmed, changed files tinted. */
export function DirectoryTree({ tree, activePath, fileChanges, onOpen, onDownload }: DirectoryTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const changed = useMemo(() => {
    const files = new Set(fileChanges.map((f) => f.path))
    const dirs = new Set<string>()
    for (const p of files) {
      const parts = p.split("/")
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"))
    }
    return { files, dirs }
  }, [fileChanges])

  const virtualizer = useVirtualizer({
    count: tree.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  // Keep the active file in view when it changes (e.g. opened from search or the diff).
  const activeIndex = tree.rows.findIndex((r) => r.kind === "entry" && r.entry.path === activePath)
  useEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: "auto" })
  }, [activeIndex, virtualizer])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto text-[12px]">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = tree.rows[item.index]
          if (!row) return null
          const style = { position: "absolute" as const, top: 0, left: 0, right: 0, height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }
          if (row.kind === "loading") {
            return (
              <div key={`loading:${row.path}`} style={{ ...style, paddingLeft: 24 + row.depth * 12 }} className="flex items-center text-muted-foreground/60">
                Loading...
              </div>
            )
          }
          const { entry } = row
          const isDir = entry.type === "directory"
          const isChanged = isDir ? changed.dirs.has(entry.path) : changed.files.has(entry.path)
          return (
            <ContextMenu key={entry.path}>
              <ContextMenuTrigger asChild>
                <button
                  style={{ ...style, paddingLeft: 8 + row.depth * 12 }}
                  onClick={() => (isDir ? tree.toggle(entry.path) : onOpen(entry.path, false))}
                  onDoubleClick={() => { if (!isDir) onOpen(entry.path, true) }}
                  title={entry.path}
                  className={cn(
                    "flex items-center gap-1.5 pr-2 text-left transition-colors",
                    entry.path === activePath ? "bg-accent" : "hover:bg-accent/50",
                    entry.ignored ? "text-muted-foreground/55" : "text-foreground/90",
                    isChanged && !entry.ignored && "text-amber-600 dark:text-amber-300",
                  )}
                >
                  {isDir ? (
                    <IconChevronRight size={12} className={cn("shrink-0 text-muted-foreground transition-transform", row.expanded && "rotate-90")} />
                  ) : (
                    <IconFile size={12} className={cn("shrink-0", entry.ignored ? "text-muted-foreground/50" : fileColor(entry.name))} />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {!isDir && (
                  <ContextMenuItem onSelect={() => onDownload(entry.path)}>
                    <IconDownload size={13} /> Download
                  </ContextMenuItem>
                )}
                <ContextMenuItem onSelect={() => { navigator.clipboard.writeText(entry.path).then(() => toast.success("Path copied"), () => toast.error("Could not copy path")) }}>
                  <IconCopy size={13} /> Copy path
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>
    </div>
  )
}
