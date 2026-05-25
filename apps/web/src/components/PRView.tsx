import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { openExternal, handleExternalClick } from "@/lib/platform"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ScrollArea } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { cn } from "@huxflux/ui"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { Popover, PopoverTrigger, PopoverContent } from "@huxflux/ui"
import type { PullRequest, ReviewComment, PRFile } from "@/data/mockReviews"
import { api } from "@huxflux/shared"
import { toast } from "sonner"
import type { PRThread, PRIssueComment } from "@huxflux/shared"
import {
  IconSend,
  IconEye,
  IconCheck,
  IconFileCode,
  IconX,
  IconLoader2,
  IconMessageCircle2,
  IconLayoutColumns,
  IconLayoutRows,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { PatchDiff } from "@pierre/diffs/react"
import type { SelectedLineRange, DiffLineAnnotation } from "@pierre/diffs"

// ── Constants ─────────────────────────────────────────────────────────────────





interface PendingReviewComment {
  id: string
  path: string
  line: number
  startLine?: number
  body: string
  source: "agentic" | "inline"
  codeContext?: ReviewComment["codeContext"]
  filePath?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ── Markdown ──────────────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  // Strip HTML comments (<!-- ... -->) before rendering
  const cleaned = content.replace(/<!--[\s\S]*?-->/g, "").trim()
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        code: ({ children, className }) => {
          if (className?.includes("language-")) {
            return (
              <pre className="bg-secondary border border-border rounded-md px-3 py-2.5 overflow-x-auto mb-2">
                <code className="text-[12px] font-mono text-foreground">{children}</code>
              </pre>
            )
          }
          return <code className="font-mono text-[12px] bg-secondary px-1 py-0.5 rounded text-foreground">{children}</code>
        },
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 pl-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 pl-1">{children}</ol>,
        li: ({ children }) => <li className="text-[13px] leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        h1: ({ children }) => <h1 className="text-[14px] font-bold text-foreground mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-[13px] font-semibold text-foreground mb-1.5 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[12px] font-medium text-foreground mb-1 mt-2 first:mt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="text-[12px] font-medium text-muted-foreground mb-1 mt-2 first:mt-0">{children}</h4>,
        details: ({ children }) => <details className="mb-2 rounded border border-border bg-secondary/20 px-3 py-1.5 text-[12px]">{children}</details>,
        summary: ({ children }) => <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">{children}</summary>,
        hr: () => <hr className="border-border my-3" />,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleExternalClick} className="text-blue-400 hover:underline">{children}</a>,
      }}
    >
      {cleaned}
    </ReactMarkdown>
  )
}

// ── Review comment card ───────────────────────────────────────────────────────


const MERGE_LABELS: Record<string, string> = { squash: "Squash and merge", merge: "Merge commit", rebase: "Rebase and merge" }

function MergeButton({ repoId, prNumber }: { repoId: string; prNumber: number }) {
  const [merging, setMerging] = useState(false)
  const [method, setMethod] = useState<"merge" | "squash" | "rebase" | null>(null)
  const [methods, setMethods] = useState<("merge" | "squash" | "rebase")[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api.getMergeMethods(repoId).then((r) => {
      setMethods(r.methods)
      if (r.methods.length > 0) setMethod(r.methods[0])
    }).catch(() => setMethods(["merge"]))
  }, [repoId])

  const handleMerge = async (m?: "merge" | "squash" | "rebase") => {
    setMerging(true)
    setOpen(false)
    try {
      await api.mergePRByRepo(repoId, prNumber, m ?? method ?? undefined)
      toast.success(`PR #${prNumber} merged`)
    } catch (err) {
      toast.error(`Merge failed: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setMerging(false)
    }
  }

  if (methods.length <= 1) {
    return (
      <Button
        size="sm"
        className="h-5 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md shrink-0"
        disabled={merging}
        onClick={() => handleMerge()}
      >
        {merging ? "Merging…" : MERGE_LABELS[methods[0] ?? "merge"] ?? "Merge"}
      </Button>
    )
  }

  return (
    <div className="flex items-center shrink-0">
      <Button
        size="sm"
        className="h-5 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-l-md rounded-r-none border-r border-emerald-700 shrink-0"
        disabled={merging}
        onClick={() => handleMerge()}
      >
        {merging ? "Merging…" : MERGE_LABELS[method ?? "merge"] ?? "Merge"}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            className="h-5 px-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-r-md rounded-l-none shrink-0"
            disabled={merging}
          >
            <IconChevronDown size={10} />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-44 p-1">
          {methods.map((m) => (
            <button
              key={m}
              onClick={() => { setMethod(m); setOpen(false) }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-[12px] rounded transition-colors",
                m === method ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {MERGE_LABELS[m]}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────

// ── Thread card (Conversations tab) ──────────────────────────────────────────

function extractDiffHunk(patch: string, targetLine: number | undefined): string | null {
  if (!targetLine) return null
  const lines = patch.split("\n")
  let bestHunkStart = -1
  let bestDistance = Infinity
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (m) {
      const hunkStart = parseInt(m[1], 10)
      const hunkLen = m[2] ? parseInt(m[2], 10) : 1
      const dist = targetLine >= hunkStart && targetLine < hunkStart + hunkLen
        ? 0
        : Math.min(Math.abs(targetLine - hunkStart), Math.abs(targetLine - (hunkStart + hunkLen)))
      if (dist < bestDistance) { bestDistance = dist; bestHunkStart = i }
    }
  }
  if (bestHunkStart === -1) return null
  const hunkLines: string[] = []
  hunkLines.push(lines[bestHunkStart])
  for (let j = bestHunkStart + 1; j < lines.length && hunkLines.length <= 10; j++) {
    if (lines[j].startsWith("@@")) break
    hunkLines.push(lines[j])
  }
  return hunkLines.join("\n")
}

function ThreadCard({
  thread,
  repoId,
  prNumber,
  fileDiffs,
  currentUser,
  onReplied,
  onResolved,
  onAttachToChat,
}: {
  thread: PRThread
  repoId: string
  prNumber: number
  fileDiffs: Record<string, string>
  currentUser?: string
  onReplied: (threadId: string, reply: PRThread["comments"][number]) => void
  onResolved: (threadId: string) => void
  onAttachToChat?: (thread: PRThread) => void
}) {
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootComment = thread.comments.find((c) => !c.isReply) ?? thread.comments[0]
  const canResolve = currentUser && rootComment?.author === currentUser

  async function handleResolve() {
    setResolving(true)
    try {
      await api.resolveThread(thread.id)
      onResolved(thread.id)
    } catch {
      setError("Failed to resolve thread")
    } finally {
      setResolving(false)
    }
  }

  async function handleReply() {
    if (!replyText.trim() || sending || !rootComment?.databaseId) return
    setSending(true)
    setError(null)
    try {
      await api.replyToPRComment(repoId, prNumber, rootComment.databaseId, replyText.trim())
      const optimistic: PRThread["comments"][number] = {
        id: `local-${Date.now()}`,
        author: "you",
        body: replyText.trim(),
        createdAt: new Date().toISOString(),
        url: "",
        isReply: true,
        path: thread.path,
        line: thread.line,
      }
      onReplied(thread.id, optimistic)
      setReplyText("")
    } catch {
      setError("Failed to send reply")
    } finally {
      setSending(false)
    }
  }

  const diffHunk = thread.path ? extractDiffHunk(fileDiffs[thread.path] ?? "", thread.line) : null

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {thread.path && (
        <div>
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border/50">
            <IconFileCode size={11} className="text-muted-foreground/40 shrink-0" />
            <code className="text-[11px] font-mono text-muted-foreground truncate flex-1">
              {thread.path}
              {thread.line && <span className="text-muted-foreground/40">:{thread.line}</span>}
            </code>
            {onAttachToChat && (
              <button
                onClick={() => onAttachToChat(thread)}
                className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                Ask in chat
              </button>
            )}
          </div>
          {diffHunk && (
            <div className="border-b border-border/50 overflow-x-auto bg-[#0d1117]">
              <pre className="text-[11px] font-mono leading-5 p-2">
                {diffHunk.split("\n").map((line, i) => {
                  const color = line.startsWith("+") ? "text-emerald-400/90"
                    : line.startsWith("-") ? "text-red-400/90"
                    : line.startsWith("@@") ? "text-blue-400/70"
                    : "text-muted-foreground/60"
                  return <div key={i} className={color}>{line || " "}</div>
                })}
              </pre>
            </div>
          )}
        </div>
      )}
      <div className="divide-y divide-border/50">
        {thread.comments.map((c) => (
          <div key={c.id} className={cn("px-3 py-2.5", c.isReply && "bg-secondary/20")}>
            <div className="flex items-center gap-1.5 mb-1.5">
              {c.avatarUrl ? (
                <img src={c.avatarUrl} alt={c.author} className="w-5 h-5 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 text-[9px] font-semibold text-muted-foreground/60 uppercase">
                  {c.author?.slice(0, 1) ?? "?"}
                </div>
              )}
              <span className="text-[12px] font-medium text-foreground">{c.author}</span>
              <span className="text-[11px] text-muted-foreground/40">
                {relativeTime(c.createdAt)}
              </span>
            </div>
            <p className="text-[12.5px] text-foreground/80 leading-relaxed pl-6.5">
              <MarkdownContent content={c.body} />
            </p>
          </div>
        ))}
      </div>
      {repoId && (
        <div className="border-t border-border/50 px-3 py-2.5 bg-background/30">
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => { setReplyText(e.target.value); setError(null) }}
              placeholder="Reply…"
              rows={1}
              disabled={sending}
              className="flex-1 text-[12px] bg-secondary/50 border border-input rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply() }
              }}
            />
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || sending || !rootComment?.databaseId}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 shrink-0"
            >
              {sending ? <IconLoader2 size={12} className="animate-spin" /> : <IconSend size={12} />}
            </button>
            {canResolve && (
              <button
                onClick={handleResolve}
                disabled={resolving}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0 disabled:opacity-40"
                title="Resolve thread"
              >
                {resolving ? <IconLoader2 size={12} className="animate-spin" /> : <IconCheck size={12} />}
                Resolve
              </button>
            )}
          </div>
          {!rootComment?.databaseId && (
            <p className="text-[11px] text-muted-foreground/40 mt-1">Reply not available for this thread</p>
          )}
          {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
        </div>
      )}
    </div>
  )
}

// ── Issue comment card ────────────────────────────────────────────────────────

function IssueCommentCard({ comment }: { comment: PRIssueComment }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        {comment.avatarUrl ? (
          <img src={comment.avatarUrl} alt={comment.author} className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 text-[10px] font-semibold text-muted-foreground/60 uppercase">
            {comment.author?.slice(0, 1) ?? "?"}
          </div>
        )}
        <span className="text-[12px] font-medium text-foreground">{comment.author}</span>
        <span className="text-[11px] text-muted-foreground/40">{relativeTime(comment.createdAt)}</span>
      </div>
      <div className="text-[12.5px] text-foreground/80 leading-relaxed pl-8">
        <MarkdownContent content={comment.body} />
      </div>
    </div>
  )
}

// ── Conversations tab ─────────────────────────────────────────────────────────

function ConversationsTab({
  pr, loadingDetails, description, prDetails, issueComments, threads, fileDiffs, currentUser,
  setIssueComments, setThreads, handleAttachToChat,
}: {
  pr: PullRequest
  loadingDetails: boolean
  description: string
  prDetails: { title: string; body?: string; author: string; avatarUrl?: string; createdAt: string; url: string } | null
  issueComments: PRIssueComment[]
  threads: PRThread[]
  fileDiffs: Record<string, string>
  currentUser?: string
  setIssueComments: React.Dispatch<React.SetStateAction<PRIssueComment[]>>
  setThreads: React.Dispatch<React.SetStateAction<PRThread[]>>
  handleAttachToChat: (thread: PRThread) => void
}) {
  const [commentBody, setCommentBody] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submitComment() {
    if (!commentBody.trim() || !pr.repoId) return
    setSubmitting(true)
    try {
      await api.sendSingleComment(pr.repoId, pr.number, commentBody.trim())
      setIssueComments((prev) => [...prev, {
        id: Date.now(),
        author: currentUser ?? "You",
        body: commentBody.trim(),
        createdAt: new Date().toISOString(),
        url: "",
      }])
      setCommentBody("")
      toast.success("Comment posted")
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        {loadingDetails ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground/40">
            <IconLoader2 size={14} className="animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/* PR summary */}
            {(description || prDetails?.body) && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border/50">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Summary</span>
                </div>
                <div className="px-3 py-2.5 text-[13px] text-foreground/80">
                  <MarkdownContent content={description || prDetails?.body || ""} />
                </div>
              </div>
            )}

            {/* All activity sorted by date */}
            {(() => {
              type Item =
                | { kind: "comment"; createdAt: string; item: PRIssueComment }
                | { kind: "thread"; createdAt: string; item: PRThread }

              const items: Item[] = [
                ...issueComments.map((c) => ({ kind: "comment" as const, createdAt: c.createdAt, item: c })),
                ...threads.map((t) => ({ kind: "thread" as const, createdAt: t.comments[0]?.createdAt ?? "", item: t })),
              ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

              if (items.length === 0 && !description) {
                return (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground/30">
                    <IconMessageCircle2 size={20} />
                    <span className="text-[12px]">No conversations yet</span>
                  </div>
                )
              }

              return items.map((entry) => {
                if (entry.kind === "comment") {
                  return <IssueCommentCard key={`ic-${entry.item.id}`} comment={entry.item} />
                }
                return (
                  <ThreadCard
                    key={`th-${entry.item.id}`}
                    thread={entry.item}
                    repoId={pr.repoId ?? ""}
                    prNumber={pr.number}
                    fileDiffs={fileDiffs}
                    currentUser={currentUser}
                    onReplied={(threadId, reply) =>
                      setThreads((prev) => prev.map((th) =>
                        th.id === threadId ? { ...th, comments: [...th.comments, reply] } : th
                      ))
                    }
                    onResolved={(threadId) =>
                      setThreads((prev) => prev.filter((th) => th.id !== threadId))
                    }
                    onAttachToChat={handleAttachToChat}
                  />
                )
              })
            })()}
          </div>
        )}
      </ScrollArea>

      {/* General comment input */}
      {pr.repoId && (
        <div className="border-t border-border p-3 shrink-0 space-y-2">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment() }}
            placeholder="Leave a comment…"
            rows={2}
            className="w-full text-[12px] bg-secondary/40 border border-input rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/30">⌘↵ to submit</span>
            <button
              onClick={submitComment}
              disabled={!commentBody.trim() || submitting || !pr.repoId}
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-1.5"
            >
              {submitting && <IconLoader2 size={11} className="animate-spin" />}
              Comment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inline-commentable diff view (using @pierre/diffs) ──────────────────────

// Markdown renderer safe for shadow DOM slots (uses inline styles, not Tailwind)
function InlineMd({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p style={{ margin: "0 0 4px", lineHeight: 1.5 }}>{children}</p>,
        code: ({ children, className }) => {
          if (className?.includes("language-")) {
            return <pre style={{ background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "6px 8px", overflow: "auto", margin: "4px 0", fontSize: 11 }}><code>{children}</code></pre>
          }
          return <code style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: 3 }}>{children}</code>
        },
        ul: ({ children }) => <ul style={{ margin: "2px 0", paddingLeft: 16 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: "2px 0", paddingLeft: 16 }}>{children}</ol>,
        li: ({ children }) => <li style={{ fontSize: 12, lineHeight: 1.5 }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 600, color: "rgba(255,255,255,0.95)" }}>{children}</strong>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleExternalClick} style={{ color: "rgb(96,165,250)", textDecoration: "none" }}>{children}</a>,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: "2px solid rgba(255,255,255,0.15)", paddingLeft: 8, margin: "4px 0", color: "rgba(255,255,255,0.5)" }}>{children}</blockquote>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function patchToGitDiff(filePath: string, patch: string): string {
  return `diff --git a/${filePath} b/${filePath}\n--- a/${filePath}\n+++ b/${filePath}\n${patch}`
}

function DiffWithInlineComments({
  patch,
  pendingComments,
  onAddComment,
  onRemoveComment,
  onEditComment,
  threads,
  filePath,
  diffStyle,
  repoId,
  prNumber,
  currentUser,
  onThreadReplied,
  onThreadResolved,
}: {
  patch: string
  pendingComments: PendingReviewComment[]
  onAddComment: (line: number, body: string, startLine?: number) => void
  onRemoveComment: (id: string) => void
  onEditComment: (id: string, body: string) => void
  threads?: PRThread[]
  filePath?: string
  diffStyle: "unified" | "split"
  repoId?: string
  prNumber?: number
  currentUser?: string
  onThreadReplied?: (threadId: string, reply: PRThread["comments"][number]) => void
  onThreadResolved?: (threadId: string) => void
}) {
  const [commentRange, setCommentRange] = useState<{ start: number; end: number } | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [replyingThreadId, setReplyingThreadId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [sending, setSending] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // Resolved threads start collapsed
    const initial = new Set<string>()
    for (const t of (threads ?? [])) { if (t.isResolved) initial.add(t.id) }
    return initial
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const diffInstanceRef = useRef<any>(null)

  function toggleCollapse(id: string) {
    setCollapsed(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function deleteThreadComment(commentDatabaseId: number, threadId: string) {
    if (!repoId || sending) return
    setSending(true)
    try {
      await api.deleteComment(repoId, commentDatabaseId)
      // Optimistic: remove the thread from view
      onThreadResolved?.(threadId)
    } catch { /* ignore */ } finally { setSending(false) }
  }

  const gitDiff = useMemo(
    () => filePath ? patchToGitDiff(filePath, patch) : patch,
    [filePath, patch]
  )

  const hasOpenForm = commentRange != null || editingId != null || replyingThreadId != null

  function handleGutterClick(range: SelectedLineRange) {
    setCommentRange({ start: range.start, end: range.end })
    setCommentBody("")
    setEditingId(null)
    setReplyingThreadId(null)
    setTimeout(() => textareaRef.current?.focus(), 80)
  }

  function submitComment() {
    if (!commentBody.trim() || !commentRange) return
    const startLine = commentRange.start !== commentRange.end ? commentRange.start : undefined
    onAddComment(commentRange.end, commentBody.trim(), startLine)
    setCommentRange(null)
    setCommentBody("")
  }

  function submitEdit() {
    if (!editBody.trim() || !editingId) return
    onEditComment(editingId, editBody.trim())
    setEditingId(null)
    setEditBody("")
  }

  async function submitReply(thread: PRThread) {
    if (!replyBody.trim() || sending || !repoId || !prNumber) return
    const rootComment = thread.comments.find((c) => !c.isReply) ?? thread.comments[0]
    if (!rootComment?.databaseId) return
    setSending(true)
    try {
      await api.replyToPRComment(repoId, prNumber, rootComment.databaseId, replyBody.trim())
      onThreadReplied?.(thread.id, {
        id: `local-${Date.now()}`, author: currentUser ?? "you", body: replyBody.trim(),
        createdAt: new Date().toISOString(), url: "", isReply: true, path: thread.path, line: thread.line,
      })
      setReplyBody("")
      setReplyingThreadId(null)
    } catch { /* ignore */ } finally { setSending(false) }
  }

  async function resolveThread(threadId: string) {
    setSending(true)
    try {
      await api.resolveThread(threadId)
      onThreadResolved?.(threadId)
    } catch { /* ignore */ } finally { setSending(false) }
  }

  // Build annotations
  const annotations = useMemo((): DiffLineAnnotation<{ id: string; kind: "thread" | "pending" | "form" }>[] => {
    const items: DiffLineAnnotation<{ id: string; kind: "thread" | "pending" | "form" }>[] = []
    for (const t of (threads ?? [])) {
      if (!t.line || !t.comments.length) continue
      items.push({ side: "additions", lineNumber: t.line, metadata: { id: t.id, kind: "thread" } })
    }
    for (const c of pendingComments) {
      items.push({ side: "additions", lineNumber: c.line, metadata: { id: c.id, kind: "pending" } })
    }
    if (commentRange) {
      items.push({ side: "additions", lineNumber: commentRange.end, metadata: { id: "__form__", kind: "form" } })
    }
    return items
  }, [threads, pendingComments, commentRange])

  // Force rerender when annotations change so slots are created
  useEffect(() => {
    if (diffInstanceRef.current && annotations.length > 0) {
      // Small delay to let React commit the slotted children first
      const timer = setTimeout(() => {
        try { diffInstanceRef.current?.rerender() } catch { /* ignore */ }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [annotations.length])

  const S = { // inline style helpers
    card: { padding: "8px 12px", background: "rgba(59,130,246,0.04)", borderRadius: 8, margin: "4px 8px", fontFamily: "system-ui, sans-serif", overflowWrap: "anywhere" as const, wordBreak: "break-word" as const, overflow: "hidden" as const, minWidth: 0, maxWidth: "100%" } as const,
    textarea: { width: "100%", fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px", color: "inherit", resize: "none" as const, overflow: "hidden" as const, outline: "none" },
    btnPrimary: { fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 4, background: "var(--primary, #3b82f6)", color: "white", border: "none", cursor: "pointer" } as const,
    btnGhost: { fontSize: 11, background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" } as const,
    btnDanger: { fontSize: 11, background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer" } as const,
    actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 } as const,
  }

  return (
    <div className="overflow-auto rounded-b-lg">
      <PatchDiff<{ id: string; kind: "thread" | "pending" | "form" }>
        patch={gitDiff}
        lineAnnotations={annotations}
        options={{
          theme: "vesper",
          diffStyle,
          lineDiffType: "word",
          diffIndicators: "bars",
          disableFileHeader: true,
          unsafeCSS: `[data-line-annotation] { overflow: hidden; min-width: 0; } [data-annotation-content] { overflow: hidden; min-width: 0; }`,
          hunkSeparators: "line-info",
          enableGutterUtility: !hasOpenForm,
          onGutterUtilityClick: handleGutterClick,
          enableLineSelection: !hasOpenForm,
          onPostRender: (_node, instance) => { diffInstanceRef.current = instance },
        }}
        renderAnnotation={(annotation) => {
          const { id, kind } = annotation.metadata

          // ── New comment form ──
          if (kind === "form" && commentRange) {
            const rangeLabel = commentRange.start !== commentRange.end
              ? `lines ${commentRange.start}–${commentRange.end}` : `line ${commentRange.end}`
            return (
              <div style={S.card}>
                <textarea ref={textareaRef} value={commentBody}
                  onChange={(e) => { setCommentBody(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px` }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment() }}
                  placeholder={`Comment on ${rangeLabel}…`} rows={2} style={S.textarea} />
                <div style={S.actions}>
                  <button onClick={submitComment} disabled={!commentBody.trim()} style={{ ...S.btnPrimary, opacity: commentBody.trim() ? 1 : 0.4 }}>Add comment</button>
                  <button onClick={() => setCommentRange(null)} style={S.btnGhost}>Cancel</button>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginLeft: "auto" }}>⌘↵</span>
                </div>
              </div>
            )
          }

          // ── Existing PR thread ──
          if (kind === "thread") {
            const t = (threads ?? []).find((th) => th.id === id)
            if (!t || !t.comments.length) return null
            const root = t.comments[0]
            const isCollapsed = collapsed.has(t.id)
            // resolved state is available via t.isResolved

            // Collapsed view
            if (isCollapsed) {
              return (
                <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: t.isResolved ? 0.5 : 0.7 }}
                  onClick={() => toggleCollapse(t.id)}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>▶</span>
                  {root.avatarUrl
                    ? <img src={root.avatarUrl} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" as const, flexShrink: 0 }} />
                    : <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(255,255,255,0.1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>{(root.author?.[0] ?? "?").toUpperCase()}</div>
                  }
                  <strong style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{root.author}</strong>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{root.body}</span>
                  {t.comments.length > 1 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{t.comments.length} comments</span>}
                  {t.isResolved && <span style={{ fontSize: 10, color: "rgba(52,211,153,0.6)", flexShrink: 0 }}>✓ Resolved</span>}
                </div>
              )
            }

            // Expanded view
            return (
              <div style={{ ...S.card, ...(t.isResolved ? { opacity: 0.7, borderLeft: "2px solid rgba(52,211,153,0.3)" } : {}) }}>
                {/* Collapse button + resolved badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }} onClick={() => toggleCollapse(t.id)}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>▼</span>
                  {t.isResolved && <span style={{ fontSize: 10, color: "rgba(52,211,153,0.6)" }}>✓ Resolved</span>}
                </div>
                {/* Comments */}
                {t.comments.map((c) => {
                  const isMyComment = currentUser && c.author === currentUser
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, ...(c.isReply ? { paddingTop: 6, paddingLeft: 28 } : {}) }}>
                      {!c.isReply && (c.avatarUrl
                        ? <img src={c.avatarUrl} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" as const, flexShrink: 0 }} />
                        : <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>{(c.author?.[0] ?? "?").toUpperCase()}</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <strong style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>{c.author}</strong>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{relativeTime(c.createdAt)}</span>
                          {isMyComment && c.databaseId && (
                            <button onClick={(e) => { e.stopPropagation(); deleteThreadComment(c.databaseId!, t.id) }}
                              disabled={sending} style={{ ...S.btnDanger, marginLeft: "auto" }}>Delete</button>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}><InlineMd text={c.body} /></div>
                      </div>
                    </div>
                  )
                })}
                {/* Reply form */}
                {replyingThreadId === t.id ? (
                  <div style={{ paddingTop: 8 }}>
                    <textarea value={replyBody}
                      onChange={(e) => { setReplyBody(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px` }}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReply(t) }}
                      placeholder="Reply…" rows={1} style={S.textarea} autoFocus />
                    <div style={S.actions}>
                      <button onClick={() => submitReply(t)} disabled={!replyBody.trim() || sending} style={{ ...S.btnPrimary, opacity: replyBody.trim() && !sending ? 1 : 0.4 }}>Reply</button>
                      <button onClick={() => { setReplyingThreadId(null); setReplyBody("") }} style={S.btnGhost}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ ...S.actions, paddingTop: 6 }}>
                    <button onClick={() => { setReplyingThreadId(t.id); setReplyBody("") }} style={{ ...S.btnGhost, color: "rgba(96,165,250,0.7)" }}>↩ Reply</button>
                    {!t.isResolved && currentUser && root.author === currentUser && (
                      <button onClick={() => resolveThread(t.id)} disabled={sending} style={S.btnGhost}>✓ Resolve</button>
                    )}
                  </div>
                )}
              </div>
            )
          }

          // ── Pending comment (user's own) ──
          if (kind === "pending") {
            const c = pendingComments.find((p) => p.id === id)
            if (!c) return null
            const isCollapsed = collapsed.has(c.id)

            if (isCollapsed) {
              return (
                <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.7 }}
                  onClick={() => toggleCollapse(c.id)}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>▶</span>
                  <span style={{ color: "rgba(96,165,250,0.6)", fontSize: 10, flexShrink: 0 }}>◆</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.body}</span>
                </div>
              )
            }

            if (editingId === c.id) {
              return (
                <div style={S.card}>
                  <textarea value={editBody}
                    onChange={(e) => { setEditBody(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px` }}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitEdit() }}
                    rows={2} style={S.textarea} autoFocus />
                  <div style={S.actions}>
                    <button onClick={submitEdit} disabled={!editBody.trim()} style={{ ...S.btnPrimary, opacity: editBody.trim() ? 1 : 0.4 }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={S.btnGhost}>Cancel</button>
                  </div>
                </div>
              )
            }
            return (
              <div style={S.card}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
                  <span style={{ color: "rgba(96,165,250,0.6)", fontSize: 10, flexShrink: 0, marginTop: 2, cursor: "pointer" }} onClick={() => toggleCollapse(c.id)}>▼</span>
                  <span style={{ color: "rgba(96,165,250,0.6)", fontSize: 10, flexShrink: 0, marginTop: 2 }}>◆</span>
                  <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.8)" }}><InlineMd text={c.body} /></div>
                  <button onClick={() => { setEditingId(c.id); setEditBody(c.body) }} style={S.btnDanger}>Edit</button>
                  <button onClick={() => onRemoveComment(c.id)} style={S.btnDanger}>✕</button>
                </div>
              </div>
            )
          }

          return null
        }}
      />
    </div>
  )
}

// ── Single-file diff accordion item ──────────────────────────────────────────

function FileDiffAccordion({
  file,
  fileDiffs,
  threads,
  repoId,
  prNumber,
  agentId: _agentId,
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
}: {
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
}) {
  const fileName = file.path.split("/").pop() ?? file.path
  const fileThreads = threads.filter((t) => t.path === file.path && t.comments.length > 0)
  const filePendingComments = pendingComments.filter((c) => c.path === file.path)

  const rawPatch = fileDiffs[file.path] ?? file.patch ?? ""

  const statusColor = file.status === "added" ? "text-emerald-400"
    : file.status === "deleted" ? "text-red-400"
    : "text-muted-foreground/50"

  return (
    <div className="rounded-lg border border-border" id={`file-${file.path.replace(/\//g, "-")}`} data-file-path={file.path}>
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 hover:bg-secondary/60 transition-colors rounded-t-lg">
        <button onClick={onToggleExpand} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <IconChevronRight size={12} className={cn("text-muted-foreground/50 shrink-0 transition-transform", isExpanded && "rotate-90")} />
          <span className="font-mono text-[12px] text-foreground/80 truncate flex-1">
            {file.path.includes("/") ? <span className="text-muted-foreground/50">{file.path.replace(`/${fileName}`, "")}/</span> : null}<span className="font-semibold text-foreground">{fileName}</span>
          </span>
          <span className={cn("text-[10px] font-mono shrink-0", statusColor)}>
            {file.status === "added" ? "added" : file.status === "deleted" ? "deleted" : ""}
          </span>
          <span className="text-emerald-400 text-[11px] font-mono shrink-0">+{file.additions}</span>
          <span className="text-red-400 text-[11px] font-mono shrink-0">-{file.deletions}</span>
        </button>
        {filePendingComments.length > 0 && (
          <span className="text-[10px] text-blue-400 shrink-0">{filePendingComments.length} comment{filePendingComments.length !== 1 ? "s" : ""}</span>
        )}
        <button
          onClick={onToggleViewed}
          className={cn("flex items-center gap-1 text-[11px] shrink-0 transition-colors", viewed ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground")}
        >
          <IconEye size={13} />
          {viewed && <span>Viewed</span>}
        </button>
      </div>

      {/* Diff content */}
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
            {file.status === "added" ? "New file" : file.status === "deleted" ? "File deleted" : "Binary or large file — diff not available"}
          </div>
        )}

      </div>
      )}
    </div>
  )
}

// ── Submit review popover ─────────────────────────────────────────────────────

function SubmitReviewPopover({
  pr,
  pendingComments,
  onClose,
  onSubmitted,
}: {
  pr: PullRequest
  pendingComments: PendingReviewComment[]
  onClose: () => void
  onSubmitted: () => void
}) {
  const [event, setEvent] = useState<"COMMENT" | "APPROVE" | "REQUEST_CHANGES">("COMMENT")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!pr.repoId) return
    setSubmitting(true)
    setError(null)
    try {
      await api.submitPRReview(pr.repoId, pr.number, {
        event,
        body,
        comments: pendingComments
          .filter((c) => c.path && c.line > 0)
          .map((c) => ({ path: c.path, line: c.line, body: c.body, ...(c.startLine ? { start_line: c.startLine } : {}) })),
      })
      onSubmitted()
      onClose()
      toast.success("Review submitted to GitHub")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col max-h-[80vh]">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-[14px] font-semibold text-foreground">Finish your review</h2>
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
          <IconX size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Comment body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a comment"
          rows={4}
          className="w-full text-[13px] bg-secondary/50 border border-input rounded-lg px-3 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring resize-none"
        />

        {/* Pending comments list */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide">
              {pendingComments.length} queued comment{pendingComments.length !== 1 ? "s" : ""}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {pendingComments.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/40 italic px-1">No inline comments queued.</p>
          ) : (
            <div className="space-y-2">
              {pendingComments.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-secondary/20 overflow-hidden text-[12px]">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-secondary/40">
                    <IconFileCode size={11} className="text-muted-foreground/40 shrink-0" />
                    <code className="font-mono text-muted-foreground truncate flex-1">
                      {c.path}
                      {c.line > 0 && <span className="text-muted-foreground/40">:{c.line}</span>}
                    </code>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                      c.source === "agentic"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : "bg-secondary text-muted-foreground/60 border-border"
                    )}>
                      {c.source}
                    </span>
                  </div>
                  {c.codeContext && c.codeContext.length > 0 && (
                    <div className="bg-[#0d0d0d] border-b border-border/50 overflow-x-auto max-h-20">
                      <table className="min-w-full text-[10px] font-mono">
                        <tbody>
                          {c.codeContext.map((line) => (
                            <tr key={line.lineNumber} className={cn(line.highlighted ? "bg-amber-500/10 text-foreground" : "text-muted-foreground/40")}>
                              <td className="select-none text-right pr-2 pl-2 py-0.5 w-8 shrink-0 border-r border-border/30 text-muted-foreground/25 tabular-nums">{line.lineNumber}</td>
                              <td className="pl-2 pr-3 py-0.5 whitespace-pre">{line.content}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="px-3 py-2 text-[12px] text-foreground/80 leading-relaxed prose-sm">
                    <MarkdownContent content={c.body} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review type */}
        <div className="space-y-1 border-t border-border pt-3">
          {(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const).map((opt) => {
            const labels = {
              COMMENT: { title: "Comment", desc: "Submit general feedback without explicit approval." },
              APPROVE: { title: "Approve", desc: "Submit feedback and approve merging these changes." },
              REQUEST_CHANGES: { title: "Request changes", desc: "Submit feedback suggesting changes." },
            }
            const l = labels[opt]
            return (
              <button
                key={opt}
                onClick={() => setEvent(opt)}
                className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left"
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center",
                  event === opt ? "border-primary" : "border-muted-foreground/30"
                )}>
                  {event === opt && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-foreground">{l.title}</div>
                  <div className="text-[12px] text-muted-foreground/60">{l.desc}</div>
                </div>
              </button>
            )
          })}
        </div>

        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <button onClick={onClose} className="text-[13px] font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-accent/50 transition-colors text-foreground">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !pr.repoId}
          className="text-[13px] font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white transition-colors flex items-center gap-2"
        >
          {submitting && <IconLoader2 size={13} className="animate-spin" />}
          Submit review
        </button>
      </div>
    </div>
  )
}

// ── CI checks popover ─────────────────────────────────────────────────────────

function CIChecksPopover({ checks }: { checks: NonNullable<PullRequest["checks"]> }) {
  const [show, setShow] = useState(false)
  const passing = checks.filter((c) => c.conclusion === "success" || c.conclusion === "neutral" || c.conclusion === "skipped").length
  const failing = checks.filter((c) => c.conclusion === "failure" || c.conclusion === "timed_out" || c.conclusion === "action_required" || c.conclusion === "cancelled").length
  const running = checks.filter((c) => c.status !== "completed").length

  const overallColor = failing > 0 ? "text-red-400 bg-red-400/10 border-red-400/20"
    : running > 0 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
    : "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"

  if (checks.length === 0) return null

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className={cn("flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border transition-colors", overallColor)}
      >
        {failing > 0 ? <IconCircleX size={11} /> : running > 0 ? <IconClock size={11} /> : <IconCircleCheck size={11} />}
        {failing > 0 ? `${failing} failing` : running > 0 ? `${running} running` : `${passing} passing`}
      </button>
      {show && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-xl shadow-xl p-2 z-50 space-y-0.5">
          {checks.map((c, i) => {
            const icon = c.status !== "completed" ? <IconLoader2 size={12} className="animate-spin text-yellow-400" />
              : c.conclusion === "success" ? <IconCircleCheck size={12} className="text-emerald-400" />
              : c.conclusion === "failure" || c.conclusion === "timed_out" ? <IconCircleX size={12} className="text-red-400" />
              : <IconClock size={12} className="text-muted-foreground/50" />
            return (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                {icon}
                <span className="text-[12px] text-foreground/80 flex-1 truncate">{c.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Chat message component ────────────────────────────────────────────────────

// ── Main PRView ───────────────────────────────────────────────────────────────

interface PRViewProps {
  pr: PullRequest
  onReviewDone?: () => void
  onUserReviewed?: () => void
  onDismiss?: () => void
}

export function PRView({ pr }: PRViewProps) {
  const [activeTab, setActiveTab] = useState<"conversations" | "changes">("conversations")

  // PR details
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({})
  const [prFiles, setPrFiles] = useState<PRFile[]>(pr.files)
  const [branch, setBranch] = useState(pr.branch)
  const [baseBranch, setBaseBranch] = useState(pr.baseBranch)
  const [description, setDescription] = useState(pr.description)
  const [threads, setThreads] = useState<PRThread[]>([])
  const [issueComments, setIssueComments] = useState<PRIssueComment[]>([])
  const [currentUser, setCurrentUser] = useState<string | undefined>()
  const [checks, setChecks] = useState<NonNullable<PullRequest["checks"]>>([])
  const [mergeableState, setMergeableState] = useState<string>("")
  const [prDetails, setPrDetails] = useState<{ title: string; body?: string; author: string; avatarUrl?: string; createdAt: string; url: string; headSha?: string } | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(!!pr.repoId)
  const [loadingDetails, setLoadingDetails] = useState(!!pr.repoId)

  // Changes tab state
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const [diffStyle, setDiffStyle] = useState<"unified" | "split">(
    () => (localStorage.getItem("huxflux:pr-diff-style") as "unified" | "split") ?? "unified"
  )

  // Pending review comments (server-side persisted)
  const [pendingComments, setPendingComments] = useState<PendingReviewComment[]>([])
  const [showSubmitPopover, setShowSubmitPopover] = useState(false)

  // Viewed files (server-side persisted)
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set())

  // Load review state from server on mount
  useEffect(() => {
    if (!pr.repoId) return
    api.getReviewState(pr.repoId, pr.number).then((state) => {
      if (state.pendingComments?.length > 0) setPendingComments(state.pendingComments)
      if (state.viewedFiles?.length > 0) setViewedFiles(new Set(state.viewedFiles))
    }).catch(() => {})
  }, [pr.repoId, pr.number])

  // Debounced save to server
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function persistReviewState(comments: PendingReviewComment[], viewed: Set<string>) {
    if (!pr.repoId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      api.saveReviewState(pr.repoId!, pr.number, {
        pendingComments: comments,
        viewedFiles: Array.from(viewed),
      }).catch(() => {})
    }, 1000)
  }

  const toggleViewed = useCallback((filePath: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      persistReviewState(pendingComments, next)
      return next
    })
  }, [pendingComments, pr.repoId, pr.number])

  function savePendingComments(updater: PendingReviewComment[] | ((prev: PendingReviewComment[]) => PendingReviewComment[])) {
    setPendingComments((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater
      persistReviewState(next, viewedFiles)
      return next
    })
  }

  // ── Load PR details ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pr.repoId) return
    api.getPRFiles(pr.repoId, pr.number).then((files) => {
      const map: Record<string, string> = {}
      const fileList: PRFile[] = []
      for (const f of files) {
        if (f.patch) map[f.path] = f.patch
        fileList.push({ path: f.path, additions: f.additions, deletions: f.deletions, status: f.status })
      }
      setFileDiffs(map)
      setPrFiles(fileList)
      const unviewedKey = `huxflux:pr-viewed:${pr.repoId}:${pr.number}`
      const viewedRaw = localStorage.getItem(unviewedKey)
      const viewed = viewedRaw ? new Set(JSON.parse(viewedRaw) as string[]) : new Set<string>()
      setExpandedFiles(new Set(fileList.filter((f) => !viewed.has(f.path)).map((f) => f.path)))
    }).catch(() => {}).finally(() => setLoadingFiles(false))

    api.getPRDetailsForRepo(pr.repoId, pr.number).then((details) => {
      if (details.branch) setBranch(details.branch)
      if (details.baseBranch) setBaseBranch(details.baseBranch)
      if (details.body) setDescription(details.body)
      if (details.currentUser) setCurrentUser(details.currentUser)
      setThreads(details.threads.filter((t: any) => t.comments.length > 0))
      setIssueComments(details.issueComments ?? [])
      setChecks((details as any).checks ?? [])
      setMergeableState((details as any).mergeableState ?? "")
      setPrDetails({
        title: details.title,
        body: details.body,
        author: details.author,
        avatarUrl: details.avatarUrl,
        createdAt: details.createdAt,
        url: (details as any).url ?? pr.url ?? "",
        headSha: details.headSha,
      })
    }).catch(() => {}).finally(() => setLoadingDetails(false))
  }, [pr.repoId, pr.number])

  // ── Render ─────────────────────────────────────────────────────────────────

  const title = prDetails?.title ?? pr.title
  const author = prDetails?.author ?? pr.author
  const avatarUrl = prDetails?.avatarUrl ?? pr.authorAvatar
  const createdAt = prDetails?.createdAt ?? pr.requestedAt
  const prUrl = prDetails?.url ?? pr.url

  return (
    <div className="flex flex-col h-full relative">

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
        <div className="flex items-start gap-3">
          {/* Header text rows */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Row 1: number + title */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-mono text-muted-foreground/50 shrink-0">#{pr.number}</span>
              {prUrl ? (
                <button
                  onClick={() => openExternal(prUrl)}
                  className="text-[14px] font-semibold text-foreground hover:text-foreground/70 transition-colors truncate text-left cursor-pointer"
                >
                  {title}
                </button>
              ) : (
                <span className="text-[14px] font-semibold text-foreground truncate">{title}</span>
              )}
            </div>
            {/* Row 2: repo · branch */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 flex-wrap min-w-0">
              <span className="font-medium text-muted-foreground/80 shrink-0">{pr.repoId || pr.repo}</span>
              <span className="text-muted-foreground/30 shrink-0">·</span>
              <span className="font-mono shrink-0">{baseBranch}</span>
              <span className="text-muted-foreground/40 shrink-0">←</span>
              <span className="font-mono shrink-0">{branch}</span>
              <button
                onClick={() => navigator.clipboard.writeText(branch).then(() => toast.success("Branch copied"))}
                className="text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
                title="Copy branch name"
              >
                <IconCopy size={11} />
              </button>
            </div>
            {/* Row 3: author + date + conflict + CI */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={author} className="w-4 h-4 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 text-[8px] text-muted-foreground/50 uppercase">
                  {author?.slice(0, 1) ?? "?"}
                </div>
              )}
              <span className="text-[11px] text-muted-foreground/70 shrink-0">{author}</span>
              {createdAt && <>
                <span className="text-muted-foreground/30 shrink-0">·</span>
                <span className="text-[11px] text-muted-foreground/50 shrink-0">{relativeTime(createdAt)}</span>
              </>}
              {mergeableState === "dirty" && (
                <>
                  <span className="text-muted-foreground/30 shrink-0">·</span>
                  <span className="flex items-center gap-1 text-[11px] text-red-400 shrink-0">
                    <IconAlertTriangle size={11} />
                    Conflicting
                  </span>
                </>
              )}
              {checks.length > 0 && (
                <>
                  <span className="text-muted-foreground/30 shrink-0">·</span>
                  <CIChecksPopover checks={checks} />
                </>
              )}
              {mergeableState && mergeableState !== "dirty" && mergeableState !== "unknown" && mergeableState !== "" && (
                <>
                  <span className="text-muted-foreground/30 shrink-0">·</span>
                  <span className={cn(
                    "flex items-center gap-1 text-[11px] shrink-0",
                    mergeableState === "clean" ? "text-emerald-400" : "text-yellow-400"
                  )}>
                    {mergeableState === "clean"
                      ? <IconCircleCheck size={11} />
                      : <IconAlertTriangle size={11} />}
                    {mergeableState === "clean" ? "Ready to merge" : mergeableState === "blocked" ? "Blocked" : "Unstable"}
                  </span>
                  {mergeableState === "clean" && pr.repoId && (
                    <MergeButton repoId={pr.repoId} prNumber={pr.number} />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Submit review button */}
          <Popover open={showSubmitPopover} onOpenChange={setShowSubmitPopover}>
            <PopoverTrigger asChild>
              <button className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-white/90 text-gray-900 text-[12px] font-semibold transition-colors">
                Submit review
                {pendingComments.length > 0 && (
                  <span className="bg-gray-900/15 text-gray-900 rounded-full text-[10px] px-1.5 py-0.5 font-bold leading-none">
                    {pendingComments.length}
                  </span>
                )}
                <IconChevronDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-[460px] p-0">
              <SubmitReviewPopover
                key={showSubmitPopover ? "open" : "closed"}
                pr={pr}
                pendingComments={pendingComments}
                onClose={() => setShowSubmitPopover(false)}
                onSubmitted={() => {
                  savePendingComments([])
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={() => setActiveTab("changes")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              activeTab === "changes" ? "bg-accent text-foreground" : "text-muted-foreground/50 hover:text-foreground hover:bg-accent/50"
            )}
          >
            Files
            {prFiles.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground/40">{prFiles.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab("conversations")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              activeTab === "conversations" ? "bg-accent text-foreground" : "text-muted-foreground/50 hover:text-foreground hover:bg-accent/50"
            )}
          >
            Conversation
            {(issueComments.length + threads.length) > 0 && <span className="ml-1 text-[10px] text-muted-foreground/40">{issueComments.length + threads.length}</span>}
          </button>
        </div>
      </div>

      {/* ── Main layout: file tree left, diff right ── */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 gap-1.5 p-1.5">
        {/* File tree (left) */}
        <ResizablePanel defaultSize={35} minSize={15}>
          <div className="flex flex-col h-full rounded-lg border border-border/50 bg-background overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="py-1">
                {prFiles.map((file) => {
                  const name = file.path.split("/").pop() ?? file.path
                  const dir = file.path.split("/").slice(0, -1).join("/")
                  const isViewed = viewedFiles.has(file.path)
                  const total = (file.additions || 0) + (file.deletions || 0)
                  const addPct = total > 0 ? ((file.additions || 0) / total) * 100 : 50
                  return (
                    <button
                      key={file.path}
                      onClick={() => {
                        setActiveTab("changes")
                        if (!expandedFiles.has(file.path)) {
                          setExpandedFiles((prev) => new Set([...prev, file.path]))
                        }
                        // Scroll after React renders the changes tab
                        setTimeout(() => {
                          const el = document.getElementById(`file-${file.path.replace(/\//g, "-")}`)
                          el?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }, 100)
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent/40",
                        isViewed && "opacity-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isViewed}
                        onChange={(e) => { e.stopPropagation(); toggleViewed(file.path) }}
                        className="accent-primary shrink-0 w-3 h-3"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-mono truncate">
                          {dir && <span className="text-muted-foreground/40">{dir}/</span>}
                          <span className={cn("text-foreground/80", isViewed && "line-through")}>{name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-emerald-400/80 font-mono">+{file.additions || 0}</span>
                          <span className="text-[9px] text-red-400/80 font-mono">-{file.deletions || 0}</span>
                          <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden max-w-[60px]">
                            <div className="h-full bg-emerald-400/60 rounded-full" style={{ width: `${addPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>

          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Diff view (right) */}
        <ResizablePanel defaultSize={65} minSize={30}>
          <div className="h-full rounded-lg border border-border/50 bg-background overflow-hidden">
          {activeTab === "conversations" ? (
            <ConversationsTab
              pr={pr}
              loadingDetails={loadingDetails}
              description={description}
              prDetails={prDetails}
              issueComments={issueComments}
              threads={threads}
              fileDiffs={fileDiffs}
              currentUser={currentUser}
              setIssueComments={setIssueComments}
              setThreads={setThreads}
              handleAttachToChat={() => {}}
            />
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
                <button
                  onClick={() => {
                    const allViewed = prFiles.every((f) => viewedFiles.has(f.path))
                    const newViewed = allViewed ? new Set<string>() : new Set(prFiles.map((f) => f.path))
                    setViewedFiles(newViewed)
                    persistReviewState(pendingComments, newViewed)
                  }}
                  className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <IconEye size={12} />
                  Mark all {prFiles.every((f) => viewedFiles.has(f.path)) ? "unviewed" : "viewed"}
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    const next = diffStyle === "unified" ? "split" : "unified"
                    setDiffStyle(next)
                    localStorage.setItem("huxflux:pr-diff-style", next)
                  }}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                  title={diffStyle === "unified" ? "Switch to split view" : "Switch to unified view"}
                >
                  {diffStyle === "unified" ? <IconLayoutColumns size={13} /> : <IconLayoutRows size={13} />}
                  {diffStyle === "unified" ? "Split" : "Unified"}
                </button>
                <button
                  onClick={() => setExpandedFiles(new Set(prFiles.map((f) => f.path)))}
                  className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Expand all
                </button>
              </div>
              {/* File diffs */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loadingFiles && prFiles.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="inline-flex items-center gap-1.5 px-4 py-3">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-2 h-2 rounded-full bg-muted-foreground/30"
                          style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.18}s infinite` }} />
                      ))}
                    </div>
                  </div>
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
                        onToggleExpand={() => setExpandedFiles((prev) => {
                          const next = new Set(prev)
                          if (next.has(file.path)) next.delete(file.path)
                          else next.add(file.path)
                          return next
                        })}
                        onThreadReplied={(threadId, reply) =>
                          setThreads((prev) => prev.map((th) =>
                            th.id === threadId ? { ...th, comments: [...th.comments, reply] } : th
                          ))
                        }
                        onThreadResolved={(threadId) =>
                          setThreads((prev) => prev.filter((th) => th.id !== threadId))
                        }
                        onAddComment={(filePath, line, body, startLine) => {
                          savePendingComments((prev) => [...prev, {
                            id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            path: filePath,
                            line,
                            startLine,
                            body,
                            source: "inline",
                          }])
                        }}
                        onRemoveComment={(id) => savePendingComments((prev) => prev.filter((c) => c.id !== id))}
                        onEditComment={(id, body) => savePendingComments((prev) => prev.map((c) => c.id === id ? { ...c, body } : c))}
                        pendingComments={pendingComments}
                        diffStyle={diffStyle}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

    </div>
  )
}
