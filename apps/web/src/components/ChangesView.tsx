import React, { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import { IconChevronDown, IconFiles } from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import type { FileChange, PRComment } from "@/data/mock"
import { DiffView } from "@/components/DiffView"
import { getBuiltInSpriteSheet } from "@pierre/trees"

// Sprite sheet injection (shared with FileViewerPanel)
let spriteInjected = false
function ensureSpriteSheet() {
  if (spriteInjected || document.querySelector("[data-icon-sprite]")) { spriteInjected = true; return }
  spriteInjected = true
  const div = document.createElement("div")
  div.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"
  div.innerHTML = getBuiltInSpriteSheet("complete")
  document.body.appendChild(div)
}

const EXT_TO_ICON: Record<string, string> = {
  ts: "file-tree-builtin-typescript", tsx: "file-tree-builtin-react",
  js: "file-tree-builtin-javascript", jsx: "file-tree-builtin-react",
  json: "file-tree-builtin-json", css: "file-tree-builtin-css",
  scss: "file-tree-builtin-css", html: "file-tree-builtin-html",
  md: "file-tree-builtin-markdown", py: "file-tree-builtin-python",
  rs: "file-tree-builtin-rust", go: "file-tree-builtin-go",
  rb: "file-tree-builtin-ruby", sh: "file-tree-builtin-bash",
  sql: "file-tree-builtin-database", svg: "file-tree-builtin-image",
  vue: "file-tree-builtin-vue", svelte: "file-tree-builtin-svelte",
  swift: "file-tree-builtin-swift", c: "file-tree-builtin-c",
  cpp: "file-tree-builtin-cpp", yaml: "file-tree-builtin-text",
  yml: "file-tree-builtin-text", toml: "file-tree-builtin-text",
}

const EXT_TO_COLOR: Record<string, string> = {
  ts: "#3178c6", tsx: "#61dafb", js: "#f0db4f", jsx: "#61dafb",
  json: "#cbcb41", css: "#563d7c", html: "#e34c26", md: "#519aba",
  py: "#3572a5", rs: "#dea584", go: "#00add8", rb: "#cc342d",
  sh: "#89e051", sql: "#e38c00", vue: "#41b883", svelte: "#ff3e00",
  swift: "#f05138",
}

function FileIcon({ fileName, size = 16 }: { fileName: string; size?: number }) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  const iconId = EXT_TO_ICON[ext] ?? "file-tree-builtin-default"
  const color = EXT_TO_COLOR[ext] ?? "currentColor"
  return (
    <svg width={size} height={size} className="shrink-0" style={{ color }}>
      <use href={`#${iconId}`} />
    </svg>
  )
}

function gitStatusLabel(file: FileChange): { letter: string; color: string } {
  if (file.deletions === 0) return { letter: "A", color: "text-emerald-400" }
  if (file.additions === 0) return { letter: "D", color: "text-red-400" }
  return { letter: "M", color: "text-amber-400" }
}

interface ChangesViewProps {
  agentId: string
  fileChanges: FileChange[]
  scrollToPath?: string
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}

export const ChangesView = React.memo(function ChangesView({
  agentId,
  fileChanges,
  scrollToPath,
  onAddComment,
  pendingComments,
  onRemoveComment,
}: ChangesViewProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const queryClient = useQueryClient()

  useEffect(() => { ensureSpriteSheet() }, [])

  // Batch fetch all diffs
  const { data: allDiffs, isLoading } = useQuery({
    queryKey: ["all-diffs", agentId],
    queryFn: () => api.getAllDiffs(agentId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  })

  // Refetch when file count changes
  const fileChangeCount = fileChanges.length
  const prevCountRef = useRef(fileChangeCount)
  useEffect(() => {
    if (prevCountRef.current !== fileChangeCount && prevCountRef.current > 0) {
      queryClient.invalidateQueries({ queryKey: ["all-diffs", agentId] })
    }
    prevCountRef.current = fileChangeCount
  }, [fileChangeCount, agentId, queryClient])

  const files: FileChange[] = useMemo(() => {
    if (!allDiffs) return fileChanges
    return allDiffs.map(d => ({ path: d.path, additions: d.additions, deletions: d.deletions }))
  }, [allDiffs, fileChanges])

  const diffsByPath = useMemo(() => {
    if (!allDiffs) return new Map<string, any>()
    return new Map(allDiffs.map(d => [d.path, d]))
  }, [allDiffs])

  // Scroll to file when scrollToPath changes
  useEffect(() => {
    if (!scrollToPath) return
    const el = fileRefs.current.get(scrollToPath)
    if (el) {
      // Ensure not collapsed
      setCollapsedFiles(prev => {
        if (!prev.has(scrollToPath)) return prev
        const next = new Set(prev)
        next.delete(scrollToPath)
        return next
      })
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
    }
  }, [scrollToPath])

  function toggleCollapse(path: string) {
    setCollapsedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-xs text-muted-foreground/40">Loading diffs...</p>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <IconFiles size={22} className="text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/40">No changes</p>
      </div>
    )
  }

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto">
      {files.map((file) => {
        const fileName = file.path.split("/").pop() ?? file.path
        const dir = file.path.split("/").slice(0, -1).join("/")
        const isCollapsed = collapsedFiles.has(file.path)
        const status = gitStatusLabel(file)
        const diffData = diffsByPath.get(file.path)

        return (
          <div
            key={file.path}
            ref={(el) => { if (el) fileRefs.current.set(file.path, el); else fileRefs.current.delete(file.path) }}
          >
            {/* Sticky floating file header */}
            <div className="sticky top-0 z-10 px-2 pt-1 pb-0.5">
              <button
                onClick={() => toggleCollapse(file.path)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-lg bg-muted/90 backdrop-blur-md border border-border/40 hover:bg-muted transition-colors shadow-sm"
              >
                <IconChevronDown
                  size={14}
                  className={cn(
                    "text-muted-foreground/50 shrink-0 transition-transform",
                    isCollapsed && "-rotate-90"
                  )}
                />
                <FileIcon fileName={fileName} />
                <span className="text-[12px] font-mono truncate">
                  <span className="font-medium text-foreground">{fileName}</span>
                  {dir && <span className="text-muted-foreground/40 ml-1.5">{dir}</span>}
                </span>
                <span className={cn("text-[11px] font-medium ml-auto shrink-0", status.color)}>
                  {status.letter}
                </span>
              </button>
            </div>

            {/* Diff content */}
            {!isCollapsed && (
              <div className="overflow-hidden">
                {diffData ? (
                  <DiffView
                    agentId={agentId}
                    file={file}
                    hideHeader
                    onAddComment={onAddComment}
                    pendingComments={pendingComments}
                    onRemoveComment={onRemoveComment}
                    preloadedDiff={diffData}
                  />
                ) : (
                  <div className="py-4 text-center text-[11px] text-muted-foreground/40">Loading diff...</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
