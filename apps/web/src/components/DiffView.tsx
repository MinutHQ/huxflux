import React, { useState, useMemo, useRef, useCallback, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import type { FileChange } from "@/data/mock"
import type { PRComment } from "@huxflux/shared"
import { api } from "@huxflux/shared"
import { getTheme } from "@/lib/theme"
import { IconCopy, IconEye, IconLayoutColumns, IconLayoutRows, IconMessageCircle, IconMessagePlus, IconX } from "@tabler/icons-react"
import { FileDiff } from "@pierre/diffs/react"
import { processFile } from "@pierre/diffs"
import type { ExpansionDirections, HunkExpansionRegion } from "@pierre/diffs/react"

export function getDiffTheme(): "vesper" | "github-light" {
  const theme = getTheme()
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  return isDark ? "vesper" : "github-light"
}

function useDiffTheme() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("huxflux:theme-change", cb); return () => window.removeEventListener("huxflux:theme-change", cb) },
    getDiffTheme,
    () => "vesper" as const
  )
}

// Annotation metadata for inline comment forms and persisted comments
type CommentAnnotation =
  | { type: "comment-form"; lineNumber: number }
  | { type: "comment"; comment: PRComment }

// ── Main component ────────────────────────────────────────────────────────────

export const DiffView = React.memo(function DiffView({ agentId, file, hideHeader, onAddComment, pendingComments = [], onRemoveComment, preloadedDiff }: {
  agentId: string
  file: FileChange
  hideHeader?: boolean
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
  preloadedDiff?: { diff: string; newContent: string; oldContent: string }
}) {
  const [viewed, setViewed] = useState(false)
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified")
  const diffTheme = useDiffTheme()
  const [expandedHunks, setExpandedHunks] = useState<Map<number, HunkExpansionRegion>>(new Map())
  const [commentLine, setCommentLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState("")
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  const fileName = file.path.split("/").pop() ?? file.path

  const { data: rawDiff } = useQuery({
    queryKey: ["diff", agentId, file.path],
    queryFn: () => api.getDiff(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !preloadedDiff,
  })

  const { data: newContent } = useQuery({
    queryKey: ["file-content", agentId, file.path],
    queryFn: () => api.getFileContent(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !preloadedDiff && !!rawDiff,
  })

  const { data: oldContent } = useQuery({
    queryKey: ["file-base-content", agentId, file.path],
    queryFn: () => api.getBaseFileContent(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !preloadedDiff && !!rawDiff,
  })

  const effectiveDiff = preloadedDiff?.diff ?? rawDiff
  const effectiveNew = preloadedDiff?.newContent ?? newContent
  const effectiveOld = preloadedDiff?.oldContent ?? oldContent

  const fileDiff = useMemo(() => {
    if (effectiveDiff && effectiveOld !== undefined && effectiveNew !== undefined) {
      return processFile(effectiveDiff, {
        oldFile: { name: fileName, contents: effectiveOld },
        newFile: { name: fileName, contents: effectiveNew },
      })
    }
    return effectiveDiff ? processFile(effectiveDiff) : null
  }, [effectiveDiff, effectiveOld, effectiveNew, fileName])

  function onHunkExpand(hunkIndex: number, direction: ExpansionDirections, expansionLineCount = 20) {
    setExpandedHunks(prev => {
      const next = new Map(prev)
      const region = { ...next.get(hunkIndex) ?? { fromStart: 0, fromEnd: 0 } }
      if (direction === "up" || direction === "both") region.fromStart += expansionLineCount
      if (direction === "down" || direction === "both") region.fromEnd += expansionLineCount
      next.set(hunkIndex, region)
      return next
    })
  }

  function handleSubmitComment() {
    if (!commentText.trim() || commentLine == null || !onAddComment) return
    onAddComment({
      id: `inline-${Date.now()}`,
      author: "You",
      body: commentText.trim(),
      createdAt: new Date().toISOString(),
      url: "",
      isReply: false,
      path: file.path,
      line: commentLine,
    })
    setCommentText("")
    setCommentLine(null)
  }

  const handleLineClick = useCallback((props: { lineNumber: number }) => {
    if (!onAddComment) return
    setCommentLine(props.lineNumber)
    setCommentText("")
    setTimeout(() => commentInputRef.current?.focus(), 50)
  }, [onAddComment])


  // Build inline annotations for persisted comments + the active comment form
  const fileComments = useMemo(() =>
    pendingComments.filter((c) => c.path === file.path && c.line),
  [pendingComments, file.path])

  const lineAnnotations = useMemo(() => {
    const annotations: Array<{ side: "additions"; lineNumber: number; metadata: CommentAnnotation }> = []

    // Persisted comments
    for (const c of fileComments) {
      if (c.line) {
        annotations.push({
          side: "additions",
          lineNumber: c.line,
          metadata: { type: "comment", comment: c },
        })
      }
    }

    // Active comment form
    if (commentLine != null) {
      annotations.push({
        side: "additions",
        lineNumber: commentLine,
        metadata: { type: "comment-form", lineNumber: commentLine },
      })
    }

    return annotations.length > 0 ? annotations : undefined
  }, [fileComments, commentLine])

  const renderAnnotation = useCallback((annotation: { metadata?: CommentAnnotation }) => {
    if (!annotation.metadata) return null

    // Persisted comment bubble
    if (annotation.metadata.type === "comment") {
      const c = annotation.metadata.comment
      return (
        <div className="mx-2 my-1 rounded-xl border border-blue-500/20 bg-blue-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2">
            <IconMessageCircle size={12} className="text-blue-400/60 shrink-0" />
            <span className="text-[11px] text-foreground/80 flex-1">{c.body}</span>
            {onRemoveComment && (
              <button
                onClick={() => onRemoveComment(c.id)}
                className="text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
              >
                <IconX size={11} />
              </button>
            )}
          </div>
        </div>
      )
    }

    // Active comment form
    if (annotation.metadata.type === "comment-form") {
      const line = annotation.metadata.lineNumber
      return (
        <div className="mx-2 my-1 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/20">
            <IconMessagePlus size={12} className="text-muted-foreground/50 shrink-0" />
            <span className="text-[11px] text-muted-foreground/70 font-mono">
              {fileName}:{line}
            </span>
            <button
              onClick={() => { setCommentLine(null); setCommentText("") }}
              className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <IconX size={12} />
            </button>
          </div>
          <div className="p-2.5">
            <textarea
              ref={commentInputRef}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmitComment() }
                if (e.key === "Escape") { setCommentLine(null); setCommentText("") }
              }}
              placeholder="Add a comment about this line..."
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-muted-foreground/30">⌘Enter to add</span>
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim()}
                className={cn(
                  "px-3 py-1 rounded-md text-[11px] font-medium transition-colors",
                  commentText.trim()
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                Add to chat
              </button>
            </div>
          </div>
        </div>
      )
    }

    return null
  }, [commentText, fileName, onRemoveComment])

  const useGutter = !!onAddComment

  const diffOptions = useMemo(() => ({
    theme: diffTheme,
    diffStyle,
    lineDiffType: "word" as const,
    diffIndicators: "bars" as const,
    disableFileHeader: true,
    hunkSeparators: "line-info-basic" as const,
    overflow: (hideHeader ? "wrap" : "scroll") as "wrap" | "scroll",
    expandedHunks,
    onHunkExpand,
    unsafeCSS: `pre { background-color: transparent !important; } :host { background-color: transparent !important; }`,
    ...(useGutter ? {
      enableGutterUtility: true,
      onLineClick: handleLineClick,
    } : {}),
  }), [diffTheme, diffStyle, expandedHunks, handleLineClick, hideHeader, useGutter])

  return (
    <div className={cn("flex flex-col", hideHeader ? "" : "h-full")}>
      {!hideHeader && <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-card shrink-0 text-[11px]">
        <span className="text-muted-foreground font-mono truncate">
          {file.path.replace(`/${fileName}`, "")}/<span className="text-foreground font-semibold">{fileName}</span>
        </span>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <button
            onClick={() => setDiffStyle(s => s === "unified" ? "split" : "unified")}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title={diffStyle === "unified" ? "Switch to split view" : "Switch to unified view"}
          >
            {diffStyle === "unified" ? <IconLayoutColumns size={13} /> : <IconLayoutRows size={13} />}
          </button>
          <button
            onClick={() => setViewed(!viewed)}
            className={cn("flex items-center gap-1.5 transition-colors", viewed ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
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
      </div>}

      <div className={hideHeader ? "" : "flex-1 min-h-0 overflow-auto"}>
        {fileDiff && (
          <FileDiff
            fileDiff={fileDiff}
            options={diffOptions as any}
            lineAnnotations={lineAnnotations as any}
            renderAnnotation={onAddComment ? renderAnnotation as any : undefined}
            style={{ backgroundColor: "transparent" }}
          />
        )}
      </div>
    </div>
  )
}, (prev, next) => {
  // Only re-render if the actual diff data or view settings changed
  if (prev.file.path !== next.file.path) return false
  if (prev.hideHeader !== next.hideHeader) return false
  if (prev.preloadedDiff !== next.preloadedDiff) return false
  if (prev.agentId !== next.agentId) return false
  if (prev.pendingComments?.length !== next.pendingComments?.length) return false
  return true
})
