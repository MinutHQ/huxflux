import { forwardRef } from "react"
import { Button, cn } from "@huxflux/ui"
import { IconChevronDown, IconFile, IconFileText } from "@tabler/icons-react"
import type { AgentFileDiff, PRComment } from "@huxflux/shared"
import { DiffView } from "../DiffView"
import { LazyMount } from "../LazyMount"
import { fileColor } from "../../utils"

interface DiffFileSectionProps {
  agentId: string
  diff: AgentFileDiff
  collapsed: boolean
  diffStyle: "unified" | "split"
  scrollRoot: HTMLElement | null
  eager: boolean
  onToggle: () => void
  onOpenFile: (path: string) => void
  pendingComments: PRComment[]
  onAddComment: (c: PRComment) => void
  onRemoveComment: (id: string) => void
}

const LINE_HEIGHT = 20

/** One file in the stacked diff: sticky collapsible header plus a lazily mounted diff body. */
export const DiffFileSection = forwardRef<HTMLDivElement, DiffFileSectionProps>(function DiffFileSection(
  { agentId, diff, collapsed, diffStyle, scrollRoot, eager, onToggle, onOpenFile, pendingComments, onAddComment, onRemoveComment },
  ref,
) {
  const name = diff.path.split("/").pop() ?? diff.path
  const dir = diff.path.slice(0, diff.path.length - name.length).replace(/\/$/, "")
  const estimate = Math.min(4000, (diff.additions + diff.deletions + 6) * LINE_HEIGHT)
  const file = { path: diff.path, additions: diff.additions, deletions: diff.deletions }

  return (
    <div ref={ref} data-path={diff.path} className="border-b border-border/40">
      <div
        className="sticky top-0 z-10 flex items-center gap-1.5 h-8 px-2 bg-card border-b border-border/40 cursor-pointer select-none"
        onClick={onToggle}
      >
        <IconChevronDown
          size={13}
          className={cn("shrink-0 text-muted-foreground transition-transform", collapsed && "-rotate-90")}
        />
        <IconFile size={13} className={cn("shrink-0", fileColor(name))} />
        <span className="text-[12px] font-medium text-foreground truncate">{name}</span>
        {dir && <span className="text-[11px] text-muted-foreground truncate min-w-0">{dir}</span>}
        <span className="shrink-0 font-mono text-[11px] tabular-nums ml-1">
          <span className="text-emerald-500">+{diff.additions}</span>
          <span className="text-red-500 ml-1">-{diff.deletions}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto shrink-0"
          title="Open file"
          onClick={(e) => { e.stopPropagation(); onOpenFile(diff.path) }}
        >
          <IconFileText size={13} />
        </Button>
      </div>
      {!collapsed && (
        <LazyMount estimatedHeight={estimate} root={scrollRoot} eager={eager}>
          {diff.diff ? (
            <DiffView
              agentId={agentId}
              file={file}
              hideHeader
              diffStyle={diffStyle}
              preloadedDiff={diff}
              pendingComments={pendingComments}
              onAddComment={onAddComment}
              onRemoveComment={onRemoveComment}
            />
          ) : (
            <p className="px-4 py-3 text-[11px] text-muted-foreground">No textual diff (binary file or mode change).</p>
          )}
        </LazyMount>
      )}
    </div>
  )
})
