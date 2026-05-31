import { cn } from "@huxflux/ui"
import { IconCopy, IconEye, IconLayoutColumns, IconLayoutRows } from "@tabler/icons-react"

interface DiffViewHeaderProps {
  filePath: string
  fileName: string
  diffStyle: "unified" | "split"
  viewed: boolean
  rawDiff: string | undefined
  onToggleDiffStyle: () => void
  onToggleViewed: () => void
}

/** Header row above a single-file diff: path, view toggle, viewed pill, copy. */
export function DiffViewHeader({
  filePath,
  fileName,
  diffStyle,
  viewed,
  rawDiff,
  onToggleDiffStyle,
  onToggleViewed,
}: DiffViewHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-card shrink-0 text-[11px]">
      <span className="text-muted-foreground font-mono truncate">
        {filePath.replace(`/${fileName}`, "")}/<span className="text-foreground font-semibold">{fileName}</span>
      </span>
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <button
          onClick={onToggleDiffStyle}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title={diffStyle === "unified" ? "Switch to split view" : "Switch to unified view"}
        >
          {diffStyle === "unified" ? <IconLayoutColumns size={13} /> : <IconLayoutRows size={13} />}
        </button>
        <button
          onClick={onToggleViewed}
          className={cn(
            "flex items-center gap-1.5 transition-colors",
            viewed ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <IconEye size={13} />
          <span>Viewed</span>
        </button>
        <button
          onClick={() => rawDiff && navigator.clipboard.writeText(rawDiff)}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="Copy diff"
        >
          <IconCopy size={13} />
        </button>
      </div>
    </div>
  )
}
