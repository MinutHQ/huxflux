import { useState, useRef, useEffect, useCallback, useMemo, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import { api } from "@huxflux/shared"
import type { PRComment } from "@huxflux/shared"
import { IconMessagePlus, IconMessageCircle, IconX } from "@tabler/icons-react"
import { codeToHtml, getFiletypeFromFileName } from "@pierre/diffs"
import { getDiffTheme } from "@/components/DiffView"

function useThemeName() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("huxflux:theme-change", cb); return () => window.removeEventListener("huxflux:theme-change", cb) },
    getDiffTheme,
    () => "vesper" as const
  )
}

interface FileContentViewProps {
  agentId: string
  filePath: string
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}

export function FileContentView({ agentId, filePath, onAddComment, pendingComments = [], onRemoveComment }: FileContentViewProps) {
  const theme = useThemeName()
  const [commentLine, setCommentLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState("")
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const isDraggingRef = useRef(false)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fileName = filePath.split("/").pop() ?? filePath
  const lang = getFiletypeFromFileName(fileName) ?? "text"

  const { data: content } = useQuery({
    queryKey: ["file-content", agentId, filePath],
    queryFn: () => api.getFileContent(agentId, filePath),
    staleTime: 10_000,
  })

  // Highlight with Shiki
  const [highlightedHtml, setHighlightedHtml] = useState<string>("")
  useEffect(() => {
    if (!content) { setHighlightedHtml(""); return }
    let cancelled = false
    codeToHtml(content, { lang, theme }).then((html) => {
      if (!cancelled) setHighlightedHtml(html)
    }).catch(() => {
      // Fallback: try plain text
      if (!cancelled) {
        codeToHtml(content, { lang: "text", theme }).then((html) => {
          if (!cancelled) setHighlightedHtml(html)
        }).catch(() => {})
      }
    })
    return () => { cancelled = true }
  }, [content, lang, theme])

  // Parse highlighted HTML into lines
  const lines = useMemo(() => {
    if (!highlightedHtml) return content?.split("\n").map((l) => escapeHtml(l)) ?? []
    // Extract content between <code> tags, split by newlines
    const codeMatch = highlightedHtml.match(/<code[^>]*>([\s\S]*)<\/code>/)
    if (!codeMatch) return content?.split("\n").map((l) => escapeHtml(l)) ?? []
    const inner = codeMatch[1]
    // Split on actual newlines in the HTML
    return inner.split("\n")
  }, [highlightedHtml, content])

  // File comments for this file
  const fileComments = useMemo(() =>
    pendingComments.filter((c) => c.path === filePath && c.line),
  [pendingComments, filePath])

  // Selection handling
  const selMin = selectionStart != null && selectionEnd != null ? Math.min(selectionStart, selectionEnd) : null
  const selMax = selectionStart != null && selectionEnd != null ? Math.max(selectionStart, selectionEnd) : null

  function handleLineClick(lineNum: number, e: React.MouseEvent) {
    if (e.shiftKey && selectionStart != null) {
      setSelectionEnd(lineNum)
    } else {
      setSelectionStart(lineNum)
      setSelectionEnd(lineNum)
      // Clear comment form if clicking a different line
      if (commentLine != null && commentLine !== lineNum) {
        setCommentLine(null)
        setCommentText("")
      }
    }
  }

  function handleGutterMouseDown(lineNum: number, e: React.MouseEvent) {
    if (!onAddComment) return
    e.preventDefault()
    if (e.shiftKey && selectionStart != null) {
      setSelectionEnd(lineNum)
      setCommentLine(Math.max(lineNum, selectionStart))
      setCommentText("")
      setTimeout(() => commentInputRef.current?.focus(), 50)
      return
    }
    setSelectionStart(lineNum)
    setSelectionEnd(lineNum)
    isDraggingRef.current = true

    function onMove(ev: MouseEvent) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const line = el?.closest("[data-line]")?.getAttribute("data-line")
      if (line) setSelectionEnd(parseInt(line))
    }
    function onUp() {
      isDraggingRef.current = false
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      // Open comment form at end of selection
      setCommentLine(lineNum)
      setCommentText("")
      setTimeout(() => commentInputRef.current?.focus(), 50)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // Comment form appears after the last selected line
  const commentAnchorLine = commentLine != null && selMax != null ? selMax : commentLine

  function handleSubmitComment() {
    if (!commentText.trim() || commentLine == null || !onAddComment) return
    const startLine = selMin ?? commentLine
    const endLine = selMax ?? commentLine
    const selectedCode = content?.split("\n").slice(startLine - 1, endLine).join("\n") ?? ""

    onAddComment({
      id: `inline-${Date.now()}`,
      author: "You",
      body: commentText.trim(),
      createdAt: new Date().toISOString(),
      url: "",
      isReply: false,
      path: filePath,
      line: startLine,
      code: selectedCode,
    })
    setCommentText("")
    setCommentLine(null)
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Code content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="font-mono text-[12px] leading-[1.65] min-w-fit">
          {lines.map((lineHtml, i) => {
            const lineNum = i + 1
            const isSelected = selMin != null && selMax != null && lineNum >= selMin && lineNum <= selMax
            const lineComment = fileComments.find(c => c.line === lineNum)

            return (
              <div key={i}>
                <div
                  className={cn(
                    "flex items-stretch group",
                    isSelected && "bg-blue-500/10"
                  )}
                >
                  {/* Gutter: line number + comment trigger */}
                  <div
                    data-line={lineNum}
                    className="w-12 shrink-0 text-right pr-3 py-0.5 select-none text-[11px] text-muted-foreground/30 cursor-pointer relative group/gutter"
                    onClick={(e) => handleLineClick(lineNum, e)}
                    onMouseDown={(e) => {
                      if (onAddComment && e.button === 0) handleGutterMouseDown(lineNum, e)
                    }}
                  >
                    {lineNum}
                    {onAddComment && (
                      <span className="absolute left-1 top-0.5 opacity-0 group-hover/gutter:opacity-100 text-blue-400/60 hover:text-blue-400 transition-opacity pointer-events-none">
                        <IconMessagePlus size={12} />
                      </span>
                    )}
                  </div>
                  {/* Code */}
                  <div
                    className="flex-1 py-0.5 pl-2 pr-4 whitespace-pre overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: lineHtml || "&nbsp;" }}
                  />
                </div>

                {/* Inline comment bubble */}
                {lineComment && (
                  <div className="mx-2 my-1 rounded-xl border border-blue-500/20 bg-blue-500/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <IconMessageCircle size={12} className="text-blue-400/60 shrink-0" />
                      <span className="text-[11px] text-foreground/80 flex-1">{lineComment.body}</span>
                      {onRemoveComment && (
                        <button
                          onClick={() => onRemoveComment(lineComment.id)}
                          className="text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
                        >
                          <IconX size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Comment form */}
                {commentAnchorLine === lineNum && (
                  <div className="mx-2 my-1 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/20">
                      <IconMessagePlus size={12} className="text-muted-foreground/50 shrink-0" />
                      <span className="text-[11px] text-muted-foreground/70 font-mono">
                        {fileName}:{selMin && selMax && selMin !== selMax ? `${selMin}-${selMax}` : lineNum}
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
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
