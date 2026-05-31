import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { IconFiles } from "@tabler/icons-react"
import { api, type FileChange, type PRComment, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { InlineDiff } from "./InlineDiff"
import { StackedDiffRow } from "./StackedDiffRow"
import { StackedDiffSidebar } from "./StackedDiffSidebar"

interface StackedDiffViewProps {
  agentId: string
  /** used for file count change detection only — the diff list comes from `useQuery` */
  fileChanges?: FileChange[]
  search: string
  showFileList: boolean
  onOpenFile: (file: FileChange) => void
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}

/**
 * "All diffs at once" view: batch-fetches every changed file's diff in one
 * request and renders them as collapsible inline diffs.
 */
export const StackedDiffView = React.memo(function StackedDiffView({
  agentId,
  fileChanges,
  search,
  showFileList,
  onOpenFile,
  onAddComment,
  pendingComments,
  onRemoveComment,
}: StackedDiffViewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const queryClient = useQueryClient()
  const { data: allDiffs, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.agents.allDiffs(agentId),
    queryFn: () => api.agents.allDiffs(agentId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    notifyOnChangeProps: ["data", "status"],
  })

  // Refetch when the number of files changes (new files added/removed by agent)
  const fileChangeCount = fileChanges?.length ?? 0
  const prevCountRef = useRef(fileChangeCount)
  useEffect(() => {
    if (prevCountRef.current !== fileChangeCount && prevCountRef.current > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.allDiffs(agentId) })
    }
    prevCountRef.current = fileChangeCount
  }, [fileChangeCount, agentId, queryClient])

  // Derive file list from batch query, not from fileChanges prop
  const files: FileChange[] = useMemo(() => {
    if (!allDiffs) return []
    return allDiffs.map((d) => ({ path: d.path, additions: d.additions, deletions: d.deletions }))
  }, [allDiffs])

  const diffsByPath = useMemo(() => {
    if (!allDiffs) return new Map<string, NonNullable<typeof allDiffs>[number]>()
    return new Map(allDiffs.map((d) => [d.path, d]))
  }, [allDiffs])

  const filtered = useMemo(
    () => (search ? files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase())) : files),
    [files, search],
  )

  function toggleFile(path: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function scrollToFile(path: string) {
    setActiveFile(path)
    if (!expandedFiles.has(path)) {
      setExpandedFiles((prev) => new Set([...prev, path]))
    }
    const el = fileRefs.current.get(path)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="flex h-full">
      <div ref={scrollContainerRef} className="flex-1 min-w-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-xs text-muted-foreground/40">Loading diffs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <IconFiles size={22} className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground/40">{search ? "No matches" : "No changes"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filtered.map((file) => {
              const isExpanded = expandedFiles.has(file.path)
              const diffData = diffsByPath.get(file.path)
              return (
                <div
                  key={file.path}
                  ref={(el) => {
                    if (el) fileRefs.current.set(file.path, el)
                    else fileRefs.current.delete(file.path)
                  }}
                >
                  <StackedDiffRow
                    file={file}
                    isExpanded={isExpanded}
                    onToggle={() => toggleFile(file.path)}
                    onOpen={() => onOpenFile(file)}
                  />
                  {isExpanded && diffData && (
                    <InlineDiff
                      diffData={diffData}
                      file={file}
                      onAddComment={onAddComment}
                      pendingComments={pendingComments}
                      onRemoveComment={onRemoveComment}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showFileList && (
        <StackedDiffSidebar
          files={filtered}
          expandedFiles={expandedFiles}
          activeFile={activeFile}
          onJumpTo={scrollToFile}
          onExpandAll={() => setExpandedFiles(new Set(filtered.map((f) => f.path)))}
          onCollapseAll={() => setExpandedFiles(new Set())}
        />
      )}
    </div>
  )
}, (prev, next) => {
  // Data comes from internal useQuery, so only re-render on these changes
  if (prev.agentId !== next.agentId) return false
  if (prev.search !== next.search) return false
  if (prev.showFileList !== next.showFileList) return false
  if (prev.pendingComments?.length !== next.pendingComments?.length) return false
  if ((prev.fileChanges?.length ?? 0) !== (next.fileChanges?.length ?? 0)) return false
  return true
})
