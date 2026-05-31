import type { PRThread, PRFile } from "@huxflux/shared"
import { cn } from "@huxflux/ui"
import { IconChevronRight, IconEye } from "@tabler/icons-react"
import type { PendingReviewComment } from "../pull-requests.types"
import { DiffWithInlineComments } from "./DiffWithInlineComments"

interface FileDiffAccordionProps {
  file: PRFile
  fileDiffs: Record<string, string>
  threads: PRThread[]
  repoId?: string
  prNumber?: number
  agentId?: string
  currentUser?: string
  viewed: boolean
  onToggleViewed: () => void
  isExpanded: boolean
  onToggleExpand: () => void
  onThreadReplied: (threadId: string, reply: PRThread["comments"][number]) => void
  onThreadResolved: (threadId: string) => void
  onAddComment: (path: string, line: number, body: string, startLine?: number) => void
  onRemoveComment: (id: string) => void
  onEditComment: (id: string, body: string) => void
  pendingComments: PendingReviewComment[]
  diffStyle: "unified" | "split"
}

/**
 * Expandable header + diff body for a single PR file in the Changes tab.
 * Anchor id `file-<sanitised path>` lets the file-tree pane scroll to it.
 */
export function FileDiffAccordion({
  file,
  fileDiffs,
  threads,
  repoId,
  prNumber,
  currentUser,
  viewed,
  onToggleViewed,
  isExpanded,
  onToggleExpand,
  onThreadReplied,
  onThreadResolved,
  onAddComment,
  onRemoveComment,
  onEditComment,
  pendingComments,
  diffStyle,
}: FileDiffAccordionProps) {
  const fileName = file.path.split("/").pop() ?? file.path
  const fileThreads = threads.filter((t) => t.path === file.path && t.comments.length > 0)
  const filePendingComments = pendingComments.filter((c) => c.path === file.path)

  const rawPatch = fileDiffs[file.path] ?? file.patch ?? ""

  const statusColor =
    file.status === "added"
      ? "text-emerald-400"
      : file.status === "deleted"
        ? "text-red-400"
        : "text-muted-foreground/50"

  return (
    <div
      className="rounded-lg border border-border"
      id={`file-${file.path.replace(/\//g, "-")}`}
      data-file-path={file.path}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 hover:bg-secondary/60 transition-colors rounded-t-lg">
        <button onClick={onToggleExpand} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <IconChevronRight
            size={12}
            className={cn("text-muted-foreground/50 shrink-0 transition-transform", isExpanded && "rotate-90")}
          />
          <span className="font-mono text-[12px] text-foreground/80 truncate flex-1">
            {file.path.includes("/") ? (
              <span className="text-muted-foreground/50">{file.path.replace(`/${fileName}`, "")}/</span>
            ) : null}
            <span className="font-semibold text-foreground">{fileName}</span>
          </span>
          <span className={cn("text-[10px] font-mono shrink-0", statusColor)}>
            {file.status === "added" ? "added" : file.status === "deleted" ? "deleted" : ""}
          </span>
          <span className="text-emerald-400 text-[11px] font-mono shrink-0">+{file.additions}</span>
          <span className="text-red-400 text-[11px] font-mono shrink-0">-{file.deletions}</span>
        </button>
        {filePendingComments.length > 0 && (
          <span className="text-[10px] text-blue-400 shrink-0">
            {filePendingComments.length} comment{filePendingComments.length !== 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={onToggleViewed}
          className={cn(
            "flex items-center gap-1 text-[11px] shrink-0 transition-colors",
            viewed ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground",
          )}
        >
          <IconEye size={13} />
          {viewed && <span>Viewed</span>}
        </button>
      </div>

      {isExpanded && (
        <div>
          {rawPatch ? (
            <DiffWithInlineComments
              patch={rawPatch}
              pendingComments={filePendingComments}
              onAddComment={(line, body, startLine) => onAddComment(file.path, line, body, startLine)}
              onRemoveComment={onRemoveComment}
              onEditComment={onEditComment}
              threads={fileThreads}
              filePath={file.path}
              diffStyle={diffStyle}
              repoId={repoId}
              prNumber={prNumber}
              currentUser={currentUser}
              onThreadReplied={onThreadReplied}
              onThreadResolved={onThreadResolved}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground/30 text-[12px]">
              {file.status === "added"
                ? "New file"
                : file.status === "deleted"
                  ? "File deleted"
                  : "Binary or large file — diff not available"}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
