import React from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
} from "@huxflux/ui"
import {
  IconEye,
  IconLayoutColumns,
  IconLayoutRows,
} from "@tabler/icons-react"
import type { PRFile, PRThread, PullRequest } from "@huxflux/shared"
import type { PendingReviewComment } from "../pull-requests.types"
import { FileDiffAccordion } from "./FileDiffAccordion"
import { PRFileTree } from "./PRFileTree"

interface ChangesTabProps {
  pr: PullRequest
  prFiles: PRFile[]
  fileDiffs: Record<string, string>
  threads: PRThread[]
  setThreads: React.Dispatch<React.SetStateAction<PRThread[]>>
  currentUser?: string
  viewedFiles: Set<string>
  toggleViewed: (path: string) => void
  setAllViewed: (next: Set<string>) => void
  expandedFiles: Set<string>
  setExpandedFiles: React.Dispatch<React.SetStateAction<Set<string>>>
  pendingComments: PendingReviewComment[]
  savePendingComments: (
    updater:
      | PendingReviewComment[]
      | ((prev: PendingReviewComment[]) => PendingReviewComment[]),
  ) => void
  diffStyle: "unified" | "split"
  setDiffStyle: (s: "unified" | "split") => void
  loadingFiles: boolean
}

/** Changes tab: diff list (left) + file tree (right). */
export function ChangesTab({
  pr,
  prFiles,
  fileDiffs,
  threads,
  setThreads,
  currentUser,
  viewedFiles,
  toggleViewed,
  setAllViewed,
  expandedFiles,
  setExpandedFiles,
  pendingComments,
  savePendingComments,
  diffStyle,
  setDiffStyle,
  loadingFiles,
}: ChangesTabProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <ResizablePanel defaultSize={72} minSize={50}>
        <div className="flex flex-col h-full overflow-hidden">
          <ChangesToolbar
            prFiles={prFiles}
            viewedFiles={viewedFiles}
            setAllViewed={setAllViewed}
            diffStyle={diffStyle}
            setDiffStyle={setDiffStyle}
            onExpandAll={() => setExpandedFiles(new Set(prFiles.map((f) => f.path)))}
          />

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loadingFiles && prFiles.length === 0 ? (
              <LoadingDots />
            ) : (
              <div className="space-y-2 p-3">
                {prFiles.map((file) => (
                  <FileDiffAccordion
                    key={file.path}
                    file={file}
                    fileDiffs={fileDiffs}
                    threads={threads}
                    repoId={pr.repoId}
                    prNumber={pr.number}
                    agentId={pr.agentId}
                    currentUser={currentUser}
                    viewed={viewedFiles.has(file.path)}
                    onToggleViewed={() => toggleViewed(file.path)}
                    isExpanded={expandedFiles.has(file.path)}
                    onToggleExpand={() =>
                      setExpandedFiles((prev) => {
                        const next = new Set(prev)
                        if (next.has(file.path)) next.delete(file.path)
                        else next.add(file.path)
                        return next
                      })
                    }
                    onThreadReplied={(threadId, reply) =>
                      setThreads((prev) =>
                        prev.map((th) =>
                          th.id === threadId ? { ...th, comments: [...th.comments, reply] } : th,
                        ),
                      )
                    }
                    onThreadResolved={(threadId) => setThreads((prev) => prev.filter((th) => th.id !== threadId))}
                    onAddComment={(filePath, line, body, startLine) =>
                      savePendingComments((prev) => [
                        ...prev,
                        {
                          id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          path: filePath,
                          line,
                          startLine,
                          body,
                          source: "inline",
                        },
                      ])
                    }
                    onRemoveComment={(id) =>
                      savePendingComments((prev) => prev.filter((c) => c.id !== id))
                    }
                    onEditComment={(id, body) =>
                      savePendingComments((prev) => prev.map((c) => (c.id === id ? { ...c, body } : c)))
                    }
                    pendingComments={pendingComments}
                    diffStyle={diffStyle}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize={28} minSize={15}>
        <div className="flex flex-col h-full border-l border-border">
          <div className="px-3 py-2 border-b border-border shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Files</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="py-1">
              <PRFileTree
                files={prFiles}
                viewedFiles={viewedFiles}
                onSelect={(path) => {
                  const el = document.getElementById(`file-${path.replace(/\//g, "-")}`)
                  el?.scrollIntoView({ behavior: "smooth", block: "start" })
                  if (!expandedFiles.has(path)) {
                    setExpandedFiles((prev) => new Set([...prev, path]))
                  }
                }}
              />
            </div>
          </ScrollArea>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function ChangesToolbar({
  prFiles,
  viewedFiles,
  setAllViewed,
  diffStyle,
  setDiffStyle,
  onExpandAll,
}: {
  prFiles: PRFile[]
  viewedFiles: Set<string>
  setAllViewed: (next: Set<string>) => void
  diffStyle: "unified" | "split"
  setDiffStyle: (s: "unified" | "split") => void
  onExpandAll: () => void
}) {
  const viewedCount = prFiles.filter((f) => viewedFiles.has(f.path)).length
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
      <button
        onClick={() => {
          const allViewed = prFiles.every((f) => viewedFiles.has(f.path))
          setAllViewed(allViewed ? new Set<string>() : new Set(prFiles.map((f) => f.path)))
        }}
        className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors flex items-center gap-1"
      >
        <IconEye size={12} />
        {viewedCount}/{prFiles.length} viewed
      </button>
      <div className="flex-1" />
      <button
        onClick={() => setDiffStyle(diffStyle === "unified" ? "split" : "unified")}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
        title={diffStyle === "unified" ? "Switch to split view" : "Switch to unified view"}
      >
        {diffStyle === "unified" ? <IconLayoutColumns size={13} /> : <IconLayoutRows size={13} />}
        {diffStyle === "unified" ? "Split" : "Unified"}
      </button>
      <button
        onClick={onExpandAll}
        className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
      >
        Expand all
      </button>
    </div>
  )
}

function LoadingDots() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="inline-flex items-center gap-1.5 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-muted-foreground/30"
            style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.18}s infinite` }}
          />
        ))}
      </div>
    </div>
  )
}
