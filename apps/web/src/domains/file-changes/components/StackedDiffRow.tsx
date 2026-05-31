import { cn } from "@huxflux/ui"
import { IconArrowUpRight, IconChevronRight } from "@tabler/icons-react"
import type { FileChange } from "@huxflux/shared"

interface StackedDiffRowProps {
  file: FileChange
  isExpanded: boolean
  onToggle: () => void
  onOpen: () => void
}

/** Single header/toggle row above an inline diff in the stacked list. */
export function StackedDiffRow({ file, isExpanded, onToggle, onOpen }: StackedDiffRowProps) {
  const name = file.path.split("/").pop() ?? file.path
  const dir = file.path.split("/").slice(0, -1).join("/")
  const isAddOnly = file.deletions === 0
  const isDelOnly = file.additions === 0

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors bg-background border-b border-border/20"
    >
      <IconChevronRight
        size={11}
        className={cn("text-muted-foreground/40 shrink-0 transition-transform", isExpanded && "rotate-90")}
      />
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          isAddOnly ? "bg-emerald-400" : isDelOnly ? "bg-red-400" : "bg-amber-400",
        )}
      />
      <span className="text-[12px] font-mono truncate flex-1 min-w-0">
        {dir && <span className="text-muted-foreground/50">{dir}/</span>}
        <span className="text-foreground font-medium">{name}</span>
      </span>
      <span className="font-mono text-[10px] shrink-0">
        <span className="text-emerald-400">+{file.additions}</span>
        {" "}
        <span className="text-red-400">-{file.deletions}</span>
      </span>
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); onOpen() }}
        className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
        title="Open in tab"
      >
        <IconArrowUpRight size={12} />
      </span>
    </button>
  )
}
