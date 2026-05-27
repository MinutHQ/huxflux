import React, { useState, useRef, useMemo, useEffect } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ScrollArea, Button, cn, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import type { Agent, FileChange, PRCheck, PRComment } from "@/data/mock"
import { api, useRepos } from "@huxflux/shared"
import { handleExternalClick } from "@/lib/platform"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { DiffView } from "@/components/DiffView"
import { FileTree, useFileTree } from "@pierre/trees/react"
import { themeToTreeStyles } from "@pierre/trees"
import type { GitStatusEntry } from "@pierre/trees"
import { useSyncExternalStore } from "react"
import { getDiffTheme } from "@/components/DiffView"
import {
  IconChevronDown,
  IconChevronRight,
  IconCheck,
  IconSearch,
  IconGitPullRequest,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconCircleDashed,
  IconArrowUpRight,
  IconFiles,
  IconAlertTriangle,
} from "@tabler/icons-react"

// ── Diff view preferences (localStorage) ─────────────────────────────────────

const DIFF_VIEW_MODE_KEY = "huxflux:diff:view-mode"
const DIFF_FILE_LIST_KEY = "huxflux:diff:file-list"

export type DiffViewMode = "tree" | "stacked"

export function getDiffViewMode(): DiffViewMode {
  return (localStorage.getItem(DIFF_VIEW_MODE_KEY) as DiffViewMode) || "tree"
}

export function setDiffViewMode(mode: DiffViewMode) {
  localStorage.setItem(DIFF_VIEW_MODE_KEY, mode)
}

export function getDiffFileList(): boolean {
  return localStorage.getItem(DIFF_FILE_LIST_KEY) !== "false"
}

export function setDiffFileList(show: boolean) {
  localStorage.setItem(DIFF_FILE_LIST_KEY, String(show))
}

// ── PR tab ────────────────────────────────────────────────────────────────────

function CheckIcon({ check }: { check: PRCheck }) {
  if (check.status !== "completed") {
    return <IconClock size={14} className="text-amber-400 shrink-0" />
  }
  switch (check.conclusion) {
    case "success": return <IconCircleCheck size={14} className="text-emerald-400 shrink-0" />
    case "skipped":
    case "neutral": return <IconCircleDashed size={14} className="text-zinc-400 shrink-0" />
    case null: return <IconClock size={14} className="text-amber-400 shrink-0" />
    default: return <IconCircleX size={14} className="text-red-400 shrink-0" />
  }
}


/** Strip HTML tags from text, preserving code blocks */
function stripHtml(text: string): string {
  // Extract code/pre blocks, strip all other HTML (tags + their content for inline tags)
  const codeBlocks: string[] = []
  // Preserve ```...``` and `...` markdown code blocks
  let result = text.replace(/```[\s\S]*?```|`[^`]+`/g, (m) => {
    codeBlocks.push(m)
    return `\x00CODE${codeBlocks.length - 1}\x00`
  })
  // Preserve <pre>/<code> HTML blocks by converting to markdown
  result = result.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    codeBlocks.push("```\n" + cleaned + "\n```")
    return `\x00CODE${codeBlocks.length - 1}\x00`
  })
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    codeBlocks.push("`" + cleaned + "`")
    return `\x00CODE${codeBlocks.length - 1}\x00`
  })
  // Remove inline HTML tags AND their content (e.g. <sub>text</sub>)
  result = result.replace(/<(sub|sup|details|summary|picture|source|img|table|thead|tbody|tr|td|th)[^>]*>[\s\S]*?<\/\1>/gi, "")
  // Remove self-closing / void tags
  result = result.replace(/<(?:img|br|hr|input)[^>]*\/?>/gi, "")
  // Strip remaining tags but keep their text content (div, p, span, a, etc)
  result = result.replace(/<\/?[a-z][a-z0-9]*[^>]*>/gi, "")
  // Decode entities
  result = result.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  // Restore code blocks
  result = result.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)])
  // Clean up excessive newlines
  result = result.replace(/\n{3,}/g, "\n\n")
  return result.trim()
}

function MarkdownComment({ body }: { body: string }) {
  return (
    <div style={{ overflowWrap: "anywhere", wordBreak: "break-word" }} className="text-[12px] text-muted-foreground leading-relaxed max-w-none min-w-0 w-full overflow-hidden [&_p]:my-1 [&_pre]:my-1.5 [&_pre]:text-[11px] [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_code]:text-[11px] [&_code]:whitespace-pre-wrap [&_code]:break-all [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_table]:w-full [&_table]:table-fixed [&_table]:text-[11px] [&_table]:overflow-x-auto [&_table]:block [&_td]:break-all [&_th]:break-all">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripHtml(body)}</ReactMarkdown>
    </div>
  )
}

export function PRView({ agentId, onAddComment }: { agentId: string; onAddComment: (c: PRComment) => void }) {
  const [markingReady, setMarkingReady] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("squash")
  const [bypassRules, setBypassRules] = useState(false)
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false)
  const [checksExpanded, setChecksExpanded] = useState(false)
  const [replyingTo, setReplyingTo] = useState<{ threadId: string; commentId: number } | null>(null)
  const [replyText, setReplyText] = useState("")
  const [submittingReply, setSubmittingReply] = useState(false)
  const queryClient = useQueryClient()

  async function handleMarkReady() {
    setMarkingReady(true)
    try {
      await api.markPRReady(agentId)
      queryClient.invalidateQueries({ queryKey: ["pr-details", agentId] })
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] })
      toast.success("PR marked ready for review")
    } catch (err) {
      toast.error(`Failed to mark ready: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setMarkingReady(false)
    }
  }

  async function handleMerge(method: "merge" | "squash" | "rebase" = mergeMethod) {
    setMerging(true)
    try {
      await api.mergePR(agentId, method)
      queryClient.invalidateQueries({ queryKey: ["pr-details", agentId] })
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] })
      toast.success("PR merged")
    } catch (err) {
      toast.error(`Merge failed: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setMerging(false)
    }
  }

  async function handleResolveThread(threadId: string) {
    try {
      await api.resolveThread(threadId)
      queryClient.invalidateQueries({ queryKey: ["pr-details", agentId] })
      toast.success("Thread resolved")
    } catch (err) {
      toast.error(`Failed to resolve: ${err instanceof Error ? err.message : "unknown error"}`)
    }
  }

  async function handleReply() {
    if (!replyingTo || !replyText.trim()) return
    setSubmittingReply(true)
    try {
      const agent = queryClient.getQueryData<Agent>(["agent", agentId])
      if (!agent?.repoId || !agent?.prNumber) throw new Error("No PR info")
      await api.replyToPRComment(agent.repoId, agent.prNumber, replyingTo.commentId, replyText.trim())
      queryClient.invalidateQueries({ queryKey: ["pr-details", agentId] })
      setReplyingTo(null)
      setReplyText("")
      toast.success("Reply posted")
    } catch (err) {
      toast.error(`Failed to reply: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setSubmittingReply(false)
    }
  }

  const { data: pr, isLoading, error } = useQuery({
    queryKey: ["pr-details", agentId],
    queryFn: () => api.getPRDetails(agentId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (isLoading) return <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">Loading...</div>
  if (error || !pr) return <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">No PR data</div>

  const isMergeable = pr.mergeableState === "clean" && !pr.merged && !pr.draft
  const successChecks = pr.checks.filter(c => c.conclusion === "success").length
  const failedChecks = pr.checks.filter(c => c.conclusion === "failure").length
  const pendingChecks = pr.checks.filter(c => c.status !== "completed").length
  const approvalCount = pr.reviews.filter(r => r.state === "APPROVED").length
  const changesCount = pr.reviews.filter(r => r.state === "CHANGES_REQUESTED").length

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
        {/* PR title + link */}
        <div className="space-y-1">
          <a href={pr.url} target="_blank" rel="noreferrer" onClick={handleExternalClick} className="flex items-start gap-1.5 group">
            <span className="text-[13px] font-medium text-foreground leading-snug group-hover:underline">{pr.title}</span>
            <IconArrowUpRight size={12} className="text-muted-foreground/50 shrink-0 mt-0.5" />
          </a>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/60 font-mono">#{pr.number}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[11px] text-muted-foreground/60">{pr.author}</span>
          </div>
        </div>

        {/* Status cards (GitHub-style stacked) */}
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
          {/* Reviews */}
          <div className="px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              {changesCount > 0 ? (
                <IconCircleX size={18} className="text-red-400 shrink-0 mt-0.5" />
              ) : (pr.mergeableState === "blocked" || approvalCount === 0) ? (
                <IconCircleDashed size={18} className="text-muted-foreground/50 shrink-0 mt-0.5" />
              ) : (
                <IconCircleCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground">
                  {changesCount > 0 ? "Changes requested" : (pr.mergeableState === "blocked" && approvalCount > 0) ? "Review required" : approvalCount > 0 ? "Approved" : "Review required"}
                </div>
                <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                  {changesCount > 0 && `${changesCount} change${changesCount > 1 ? "s" : ""} requested`}
                  {changesCount === 0 && approvalCount > 0 && pr.mergeableState === "blocked" && `${approvalCount} approval${approvalCount > 1 ? "s" : ""}, more required`}
                  {changesCount === 0 && approvalCount > 0 && pr.mergeableState !== "blocked" && `${approvalCount} approving review${approvalCount > 1 ? "s" : ""}`}
                  {changesCount === 0 && approvalCount === 0 && "No reviews yet"}
                </div>
              </div>
            </div>
            {/* Reviewer list */}
            {pr.reviews.length > 0 && (
              <div className="mt-2 ml-7 space-y-1.5">
                {pr.reviews.map((r) => (
                  <div key={r.author} className="flex items-center gap-2">
                    {r.avatarUrl ? (
                      <img src={r.avatarUrl} alt={r.author} className="w-4 h-4 rounded-full shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-muted shrink-0" />
                    )}
                    <span className="text-[11px] font-medium text-foreground">{r.author}</span>
                    <span className={cn(
                      "text-[10px]",
                      r.state === "APPROVED" && "text-emerald-400",
                      r.state === "CHANGES_REQUESTED" && "text-red-400",
                      (r.state === "PENDING" || r.state === "COMMENTED" || r.state === "DISMISSED") && "text-muted-foreground/50",
                    )}>
                      {r.state === "APPROVED" ? "Approved" : r.state === "CHANGES_REQUESTED" ? "Requested changes" : r.state === "DISMISSED" ? "Dismissed" : "Pending"}
                    </span>
                    {r.state === "CHANGES_REQUESTED" && !pr.merged && (
                      <button
                        onClick={() => api.rerequestReview(agentId).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["pr-details", agentId] })
                          toast.success(`Re-requested review from ${r.author}`)
                        }).catch(() => toast.error("Failed to re-request"))}
                        className="text-[10px] text-primary hover:underline ml-auto"
                      >
                        re-request
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checks */}
          {pr.checks.length > 0 && (
            <div className="px-3 py-2.5">
              <button onClick={() => setChecksExpanded(!checksExpanded)} className="w-full flex items-start gap-2.5 text-left">
                {failedChecks > 0 ? (
                  <IconCircleX size={18} className="text-red-400 shrink-0 mt-0.5" />
                ) : pendingChecks > 0 ? (
                  <IconClock size={18} className="text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <IconCircleCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-foreground">
                    {failedChecks > 0 ? `${failedChecks} check${failedChecks > 1 ? "s" : ""} failed` : pendingChecks > 0 ? "Checks in progress" : "All checks passed"}
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {successChecks > 0 && `${successChecks} passed`}
                    {pendingChecks > 0 && `${successChecks > 0 ? ", " : ""}${pendingChecks} pending`}
                    {failedChecks > 0 && `${successChecks > 0 || pendingChecks > 0 ? ", " : ""}${failedChecks} failed`}
                  </div>
                </div>
                <IconChevronDown size={13} className={cn("text-muted-foreground/40 shrink-0 mt-1 transition-transform", checksExpanded && "rotate-180")} />
              </button>
              {checksExpanded && (
                <div className="mt-2 ml-7 space-y-1">
                  {pr.checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckIcon check={check} />
                      <span className="text-[11px] text-foreground flex-1 truncate">{check.name}</span>
                      {check.url && (
                        <a href={check.url} target="_blank" rel="noreferrer" onClick={handleExternalClick} className="text-muted-foreground/40 hover:text-muted-foreground">
                          <IconArrowUpRight size={10} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Merge status */}
          <div className="px-3 py-2.5 flex items-start gap-2.5">
            {pr.merged ? (
              <IconCircleCheck size={18} className="text-purple-400 shrink-0 mt-0.5" />
            ) : pr.mergeableState === "dirty" ? (
              <IconAlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            ) : pr.mergeableState === "blocked" ? (
              <IconAlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            ) : isMergeable ? (
              <IconCircleCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <IconCircleDashed size={18} className="text-muted-foreground/50 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-foreground">
                {pr.merged ? "Merged" : pr.mergeableState === "dirty" ? "Merge conflict" : pr.mergeableState === "blocked" ? "Merging is blocked" : isMergeable ? "Ready to merge" : pr.draft ? "Draft" : "Pending"}
              </div>
              <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                {pr.merged ? "This PR has been merged" : pr.mergeableState === "dirty" ? "Resolve conflicts before merging" : pr.mergeableState === "blocked" ? "Requirements not met" : isMergeable ? "All checks passed and requirements met" : pr.draft ? "Mark as ready for review first" : "Waiting for reviews and checks"}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        {!pr.merged && (
          <div className="space-y-2">
            {pr.draft ? (
              <Button size="sm" className="w-full text-[12px]" onClick={handleMarkReady} disabled={markingReady}>
                {markingReady ? "Marking ready..." : "Mark ready for review"}
              </Button>
            ) : (
              <>
                {!isMergeable && (
                  <button
                    onClick={() => setBypassRules(!bypassRules)}
                    className="flex items-center gap-2 text-[11px] text-red-400/80 cursor-pointer select-none"
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                      bypassRules ? "bg-red-400 border-red-400" : "border-muted-foreground/30"
                    )}>
                      {bypassRules && <IconCheck size={10} className="text-background" />}
                    </div>
                    Merge without waiting for requirements (bypass rules)
                  </button>
                )}
                <div className="flex items-center">
                  <Button
                    size="sm"
                    className="text-[12px] flex-1 rounded-r-none"
                    onClick={() => handleMerge(mergeMethod)}
                    disabled={merging || (!isMergeable && !bypassRules)}
                  >
                    {merging ? "Merging..." : `${mergeMethod.charAt(0).toUpperCase() + mergeMethod.slice(1)} merge`}
                  </Button>
                  <Popover open={mergeMenuOpen} onOpenChange={setMergeMenuOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        size="sm"
                        className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                        disabled={merging || (!isMergeable && !bypassRules)}
                      >
                        <IconChevronDown size={12} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 p-1" sideOffset={4}>
                      {(["squash", "merge", "rebase"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => { setMergeMethod(m); setMergeMenuOpen(false) }}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors",
                            mergeMethod === m && "font-medium text-foreground"
                          )}
                        >
                          {mergeMethod === m && <IconCheck size={12} />}
                          <span className={mergeMethod !== m ? "pl-5" : ""}>{m.charAt(0).toUpperCase() + m.slice(1)} merge</span>
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
          </div>
        )}

        {/* Review threads */}
        {pr.threads.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Threads <span className="text-muted-foreground/50 normal-case font-normal">{pr.threads.length}</span>
            </div>
            <div className="space-y-2.5 min-w-0">
              {pr.threads.map((thread) => (
                <div key={thread.id} className={cn("rounded-xl border bg-card overflow-hidden min-w-0 transition-opacity", thread.isResolved ? "border-border/30 opacity-50" : "border-border/50")}>
                  {thread.comments.map((c, ci) => (
                    <div key={c.id} className={cn("group/comment px-3.5 py-2.5 min-w-0 @container", ci > 0 && "border-t border-border/30")}>
                      <div className="flex items-center gap-2 mb-1.5 min-w-0">
                        {c.avatarUrl && <img src={c.avatarUrl} alt={c.author} className="w-4 h-4 rounded-full shrink-0 ring-1 ring-border/50" />}
                        <span className="text-[11px] font-semibold text-foreground/90 shrink-0">{c.author}</span>
                        {c.path && (
                          <span className="text-[10px] text-muted-foreground/30 font-mono truncate" style={{ direction: "rtl", textAlign: "left" }}>
                            {c.path}{c.line ? `:${c.line}` : ""}
                          </span>
                        )}
                        <button
                          onClick={() => onAddComment(c)}
                          className="opacity-0 group-hover/comment:opacity-100 text-[10px] text-muted-foreground/40 hover:text-foreground transition-all ml-auto px-1.5 py-0.5 rounded-md hover:bg-accent shrink-0"
                          title="Add to chat"
                        >
                          + Chat
                        </button>
                      </div>
                      <MarkdownComment body={c.body} />
                    </div>
                  ))}
                  {/* Reply + resolve actions */}
                  <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border/30 bg-muted/20">
                    {replyingTo?.threadId === thread.id ? (
                      <div className="flex-1 flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply() } if (e.key === "Escape") setReplyingTo(null) }}
                          placeholder="Reply..."
                          className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-ring"
                          disabled={submittingReply}
                        />
                        <Button size="xs" onClick={handleReply} disabled={submittingReply || !replyText.trim()} className="text-[10px]">Send</Button>
                        <Button variant="ghost" size="xs" onClick={() => setReplyingTo(null)} className="text-[10px]">Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            const lastComment = thread.comments[thread.comments.length - 1]
                            setReplyingTo({ threadId: thread.id, commentId: lastComment.databaseId ?? 0 })
                            setReplyText("")
                          }}
                          className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
                        >
                          Reply
                        </button>
                        {!thread.isResolved && (
                          <button
                            onClick={() => handleResolveThread(thread.id)}
                            className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
                          >
                            Resolve
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discussion comments */}
        {pr.issueComments.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Discussion <span className="text-muted-foreground/50 normal-case font-normal">{pr.issueComments.length}</span>
            </div>
            <div className="space-y-2.5">
              {pr.issueComments.map((c) => (
                <div key={c.id} className="group/comment rounded-xl border border-border/50 bg-card px-3.5 py-2.5 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {c.avatarUrl && <img src={c.avatarUrl} alt={c.author} className="w-4 h-4 rounded-full ring-1 ring-border/50" />}
                    <span className="text-[11px] font-semibold text-foreground/90">{c.author}</span>
                    <button
                      onClick={() => onAddComment({ id: String(c.id), author: c.author, avatarUrl: c.avatarUrl, body: c.body, createdAt: c.createdAt, url: c.url, isReply: false })}
                      className="opacity-0 group-hover/comment:opacity-100 text-[10px] text-muted-foreground/40 hover:text-foreground transition-all ml-auto px-1.5 py-0.5 rounded-md hover:bg-accent"
                      title="Add to chat"
                    >
                      + Chat
                    </button>
                    <a href={c.url} target="_blank" rel="noreferrer" onClick={handleExternalClick} className="text-muted-foreground/30 hover:text-muted-foreground/60">
                      <IconArrowUpRight size={11} />
                    </a>
                  </div>
                  <MarkdownComment body={c.body} />
                </div>
              ))}
            </div>
          </div>
        )}

        {pr.reviews.length === 0 && pr.checks.length === 0 && pr.threads.length === 0 && pr.issueComments.length === 0 && (
          <p className="text-[12px] text-muted-foreground/40 text-center py-4">No reviews or checks yet</p>
        )}
      </div>
    </ScrollArea>
  )
}

// ── Tree theme helper ────────────────────────────────────────────────────────

const resolvedThemeCache = new Map<string, any>()

function useTreeThemeStyles(): React.CSSProperties {
  const themeName = useSyncExternalStore(
    (cb) => {
      window.addEventListener("huxflux:theme-change", cb)
      window.addEventListener("huxflux:color-theme-change", cb)
      return () => { window.removeEventListener("huxflux:theme-change", cb); window.removeEventListener("huxflux:color-theme-change", cb) }
    },
    getDiffTheme,
  )

  const [resolvedTheme, setResolvedTheme] = useState<any>(null)

  useEffect(() => {
    if (resolvedThemeCache.has(themeName)) {
      setResolvedTheme(resolvedThemeCache.get(themeName))
      return
    }
    import("@pierre/diffs").then(({ resolveTheme }) => {
      resolveTheme(themeName).then((t) => {
        resolvedThemeCache.set(themeName, t)
        setResolvedTheme(t)
      })
    })
  }, [themeName])

  return useMemo(() => {
    if (!resolvedTheme) return {} as React.CSSProperties
    const s = getComputedStyle(document.documentElement)
    const v = (name: string) => s.getPropertyValue(name).trim()
    const cardFg = v("--card-foreground")
    return {
      ...themeToTreeStyles(resolvedTheme),
      backgroundColor: "transparent",
      color: cardFg,
      "--trees-theme-sidebar-bg": "transparent",
      "--trees-theme-sidebar-fg": cardFg,
      "--trees-theme-panel-bg": "transparent",
      "--trees-theme-panel-fg": cardFg,
      "--trees-theme-input-bg": v("--muted"),
      "--trees-theme-input-fg": cardFg,
      "--trees-theme-input-border": v("--border"),
      "--trees-theme-list-hover-bg": v("--accent"),
      "--trees-theme-list-active-selection-bg": v("--accent"),
      "--trees-theme-list-active-selection-fg": v("--accent-foreground"),
    } as React.CSSProperties
  }, [resolvedTheme])
}

// ── All files tree ───────────────────────────────────────────────────────────

interface FileTreeEntry {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileTreeEntry[]
}



// ── Stacked diff view ────────────────────────────────────────────────────────

export const StackedDiffView = React.memo(function StackedDiffView({
  agentId,
  fileChanges,
  search,
  showFileList,
  onOpenFile,
  onAddComment,
  pendingComments,
  onRemoveComment,
}: {
  agentId: string
  fileChanges?: FileChange[] // used for file count change detection
  search: string
  showFileList: boolean
  onOpenFile: (file: FileChange) => void
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Batch fetch all diffs in one request — this is the sole data source
  const queryClient = useQueryClient()
  const { data: allDiffs, isLoading } = useQuery({
    queryKey: ["all-diffs", agentId],
    queryFn: () => api.getAllDiffs(agentId),
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
      queryClient.invalidateQueries({ queryKey: ["all-diffs", agentId] })
    }
    prevCountRef.current = fileChangeCount
  }, [fileChangeCount, agentId, queryClient])

  // Derive file list from batch query, not from fileChanges prop
  const files: FileChange[] = useMemo(() => {
    if (!allDiffs) return []
    return allDiffs.map(d => ({ path: d.path, additions: d.additions, deletions: d.deletions }))
  }, [allDiffs])

  const diffsByPath = useMemo(() => {
    if (!allDiffs) return new Map()
    return new Map(allDiffs.map(d => [d.path, d]))
  }, [allDiffs])

  const filtered = useMemo(() =>
    search ? files.filter(f => f.path.toLowerCase().includes(search.toLowerCase())) : files,
  [files, search])


  function toggleFile(path: string) {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function scrollToFile(path: string) {
    setActiveFile(path)
    if (!expandedFiles.has(path)) {
      setExpandedFiles(prev => new Set([...prev, path]))
    }
    const el = fileRefs.current.get(path)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function expandAll() {
    setExpandedFiles(new Set(filtered.map(f => f.path)))
  }

  function collapseAll() {
    setExpandedFiles(new Set())
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
              const name = file.path.split("/").pop() ?? file.path
              const dir = file.path.split("/").slice(0, -1).join("/")
              const isExpanded = expandedFiles.has(file.path)
              const isAddOnly = file.deletions === 0
              const isDelOnly = file.additions === 0
              const diffData = diffsByPath.get(file.path)

              return (
                <div
                  key={file.path}
                  ref={(el) => { if (el) fileRefs.current.set(file.path, el); else fileRefs.current.delete(file.path) }}
                >
                  <button
                    onClick={() => toggleFile(file.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors border-b border-border/20"
                  >
                    <IconChevronRight size={11} className={cn("text-muted-foreground/40 shrink-0 transition-transform", isExpanded && "rotate-90")} />
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      isAddOnly ? "bg-emerald-400"
                        : isDelOnly ? "bg-red-400"
                        : "bg-amber-400"
                    )} />
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
                      onClick={(e) => { e.stopPropagation(); onOpenFile(file) }}
                      className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                      title="Open in tab"
                    >
                      <IconArrowUpRight size={12} />
                    </span>
                  </button>
                  {isExpanded && diffData && (
                    <InlineDiff diffData={diffData} file={file} onAddComment={onAddComment} pendingComments={pendingComments} onRemoveComment={onRemoveComment} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* File list sidebar (right) */}
      {showFileList && (
        <div className="w-48 shrink-0 border-l border-border flex flex-col">
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border shrink-0">
            <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Files</span>
            <div className="flex items-center gap-0.5">
              <button onClick={expandAll} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expand all">
                <IconChevronDown size={12} />
              </button>
              <button onClick={collapseAll} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Collapse all">
                <IconChevronRight size={12} />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="py-1">
              {filtered.map((file) => {
                const name = file.path.split("/").pop() ?? file.path
                const isAddOnly = file.deletions === 0
                const isDelOnly = file.additions === 0
                const isExpanded = expandedFiles.has(file.path)
                return (
                  <button
                    key={file.path}
                    onClick={() => scrollToFile(file.path)}
                    className={cn(
                      "w-full flex items-center gap-1.5 px-2.5 py-1 text-left transition-colors",
                      activeFile === file.path ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    )}
                  >
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      isAddOnly ? "bg-emerald-400"
                        : isDelOnly ? "bg-red-400"
                        : "bg-amber-400"
                    )} />
                    <span className={cn("text-[11px] truncate", isExpanded && "font-medium")}>{name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
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

/** Renders a single file diff using pre-fetched batch data */
const InlineDiff = React.memo(function InlineDiff({ diffData, file, onAddComment, pendingComments, onRemoveComment }: {
  diffData: { diff: string; newContent: string; oldContent: string }
  file: FileChange
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}) {
  return (
    <DiffView
      agentId=""
      file={file}
      hideHeader
      onAddComment={onAddComment}
      pendingComments={pendingComments}
      onRemoveComment={onRemoveComment}
      preloadedDiff={diffData}
    />
  )
})


// ── Unified file tree ────────────────────────────────────────────────────────

const STACKED_DIFF_THRESHOLD = 100

function UnifiedFileTree({
  agentId,
  repoId,
  fileChanges,
  onFileContentSelect,
  onFileSelect,
  onOpenDiffBrowser,
  onOpenPRTab,
  hasPR,
  prView,
  onAddComment,
  pendingComments,
  onRemoveComment,
}: {
  agentId: string
  repoId: string | null
  fileChanges: FileChange[]
  onFileContentSelect: (path: string) => void
  onFileSelect: (file: FileChange) => void
  onOpenDiffBrowser?: (scrollToPath?: string) => void
  onOpenPRTab?: () => void
  hasPR?: boolean
  prView?: React.ReactNode
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}) {
  const treeThemeStyles = useTreeThemeStyles()
  const [search, setSearch] = useState("")
  const { data: repos = [] } = useRepos()
  const isFolderAgent = repos.find((r) => r.id === repoId)?.type === "folder"

  // Refs for callbacks so useFileTree's stale closure always calls the latest version
  const onFileContentSelectRef = useRef(onFileContentSelect)
  onFileContentSelectRef.current = onFileContentSelect
  const onOpenDiffBrowserRef = useRef(onOpenDiffBrowser)
  onOpenDiffBrowserRef.current = onOpenDiffBrowser

  const { data: tree, isLoading } = useQuery({
    queryKey: ["file-tree", agentId, isFolderAgent ? "folder-root" : "full"],
    queryFn: () => api.getFileTree(agentId),
    staleTime: 30_000,
  })

  const [activeView, setActiveView] = useState<"all" | "diff" | "pr">("all")

  // Folder agents: incrementally-grown set of known paths (files + `dir/` markers
  // for subdirs whose contents have or haven't been fetched yet).
  const [folderPaths, setFolderPaths] = useState<Set<string>>(new Set())
  // Directories we've already requested children for (the empty string represents root).
  const loadedDirs = useRef<Set<string>>(new Set())

  // Reset lazy-load bookkeeping when the agent changes.
  useEffect(() => {
    setFolderPaths(new Set())
    loadedDirs.current = new Set()
  }, [agentId])

  // Seed folder paths from the initial root response.
  useEffect(() => {
    if (!isFolderAgent || !tree) return
    setFolderPaths((prev) => {
      const next = new Set(prev)
      for (const e of tree as FileTreeEntry[]) next.add(e.path)
      return next
    })
    loadedDirs.current.add("")
  }, [tree, isFolderAgent])

  // All repo file paths for the "All files" tree view.
  const allPaths = useMemo(() => {
    if (isFolderAgent) return Array.from(folderPaths).sort()
    if (!tree) return fileChanges.map(f => f.path)
    const paths: string[] = []
    function walk(entries: FileTreeEntry[]) {
      for (const e of entries) {
        if (e.type === "file") paths.push(e.path)
        if (e.children) walk(e.children)
      }
    }
    walk(tree as FileTreeEntry[])
    return paths
  }, [tree, fileChanges, isFolderAgent, folderPaths])

  const gitStatus = useMemo<GitStatusEntry[]>(() =>
    fileChanges.map(f => ({
      path: f.path,
      status: f.deletions === 0 ? "added" as const
        : f.additions === 0 ? "deleted" as const
        : "modified" as const,
    })),
  [fileChanges])

  const { model } = useFileTree({
    paths: allPaths,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    icons: { set: "complete", colored: true },
    density: "compact",
    flattenEmptyDirectories: true,
    gitStatus,
    initialExpansion: "closed",
    onSelectionChange: (selectedPaths) => {
      if (selectedPaths.length > 0) onFileContentSelectRef.current(selectedPaths[0])
    },
  })

  // Sync model with allPaths.
  //   • Git agents: `resetPaths` on every change (tree may change wholesale).
  //   • Folder agents: incremental `add` only, so per-directory expansion state
  //     survives across lazy fetches.
  const prevAllPathsRef = useRef<string[]>([])
  useEffect(() => {
    if (!isFolderAgent) {
      model.resetPaths(allPaths)
      prevAllPathsRef.current = allPaths
      return
    }
    const prev = new Set(prevAllPathsRef.current)
    const toAdd = allPaths.filter((p) => !prev.has(p))
    if (prevAllPathsRef.current.length === 0 && allPaths.length > 0) {
      // First populate — single reset is cheaper than N adds.
      model.resetPaths(allPaths)
    } else if (toAdd.length > 0) {
      model.batch(toAdd.map((path) => ({ type: "add" as const, path })))
    }
    prevAllPathsRef.current = allPaths
  }, [allPaths, model, isFolderAgent])

  useEffect(() => {
    model.setGitStatus(gitStatus)
  }, [gitStatus, model])

  // Folder agents: when a directory is expanded for the first time, fetch its
  // immediate children and merge them into the path set. Pierre's FileTree
  // doesn't expose explicit expand events, so we subscribe to its generic
  // change notifier and poll the directory handle's isExpanded() state.
  useEffect(() => {
    if (!isFolderAgent) return
    let cancelled = false
    const checkExpansions = () => {
      if (cancelled) return
      for (const p of folderPaths) {
        if (!p.endsWith("/")) continue
        if (loadedDirs.current.has(p)) continue
        const handle = model.getItem(p)
        if (handle?.isDirectory() && handle.isExpanded()) {
          loadedDirs.current.add(p)
          const subPath = p.replace(/\/+$/, "")
          api.getFileTree(agentId, subPath)
            .then((children) => {
              if (cancelled) return
              setFolderPaths((prev) => {
                const next = new Set(prev)
                for (const e of children as FileTreeEntry[]) next.add(e.path)
                return next
              })
            })
            .catch(() => {
              // Allow another attempt on the next expansion check.
              loadedDirs.current.delete(p)
            })
        }
      }
    }
    const unsubscribe = model.subscribe(checkExpansions)
    // Run once immediately in case directories were already expanded.
    checkExpansions()
    return () => { cancelled = true; unsubscribe() }
  }, [model, isFolderAgent, agentId, folderPaths])

  // Diff tree — changed files only
  const changedPaths = useMemo(() => fileChanges.map(f => f.path), [fileChanges])

  const { model: diffModel } = useFileTree({
    paths: changedPaths,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    icons: { set: "complete", colored: true },
    density: "compact",
    flattenEmptyDirectories: true,
    gitStatus,
    initialExpansion: "open",
    onSelectionChange: (selectedPaths) => {
      if (selectedPaths.length > 0) {
        const p = selectedPaths[0]
        if (changedPaths.includes(p)) {
          onOpenDiffBrowserRef.current?.(p)
        }
      }
    },
  })

  useEffect(() => {
    diffModel.resetPaths(changedPaths)
  }, [changedPaths, diffModel])

  useEffect(() => {
    diffModel.setGitStatus(gitStatus)
  }, [gitStatus, diffModel])

  function switchToAll() { setActiveView("all") }
  function switchToDiff() { setActiveView("diff") }
  function switchToPR() { setActiveView("pr") }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 shrink-0">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={switchToAll}
            className={cn(
              "px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              activeView === "all"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
            )}
          >
            All files
          </button>
          <button
            onClick={switchToDiff}
            onDoubleClick={(e) => { e.preventDefault(); onOpenDiffBrowser?.() }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              activeView === "diff"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
            )}
          >
            Diff
            {fileChanges.length > 0 && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                activeView === "diff" ? "bg-background/60 text-foreground" : "bg-accent/60 text-muted-foreground"
              )}>
                {fileChanges.length}
              </span>
            )}
          </button>
          {hasPR && (
            <button
              onClick={switchToPR}
              onDoubleClick={(e) => { e.preventDefault(); onOpenPRTab?.() }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
                activeView === "pr"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
              )}
            >
              <IconGitPullRequest size={12} />
              PR
            </button>
          )}
        </div>

      </div>

      {/* Content */}
      {activeView === "pr" && prView ? (
        <div className="flex-1 min-h-0">{prView}</div>
      ) : activeView === "diff" ? (
        <div className="flex-1 min-h-0">
          {fileChanges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <IconFiles size={22} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/40">No changes</p>
            </div>
          ) : (
            <FileTree
              model={diffModel}
              className="h-full"
              style={treeThemeStyles}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-muted-foreground/40">Loading...</p>
            </div>
          ) : allPaths.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <IconFiles size={22} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/40">{search ? "No matches" : "No files"}</p>
            </div>
          ) : (
            <FileTree
              model={model}
              className="h-full"
              style={treeThemeStyles}
            />
          )}
        </div>
      )}
    </div>
  )
}


// ── Main component ────────────────────────────────────────────────────────────

interface FileChangesViewProps {
  agent: Agent
  selectedFile: string | null
  onFileSelect: (file: FileChange | null) => void
  onFileContentSelect: (path: string) => void
  onAddComment: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
  onOpenDiffBrowser?: (scrollToPath?: string) => void
  onOpenPRTab?: () => void
  /** When provided, tab state is controlled externally */
  tab?: "files" | "changes" | "pr"
  onTabChange?: (tab: "files" | "changes" | "pr") => void
  /** Hide the internal tab header (when tabs are rendered elsewhere) */
  hideHeader?: boolean
}

export function FileChangesView({ agent, selectedFile: _selectedFile, onFileSelect, onFileContentSelect, onAddComment, pendingComments, onRemoveComment, tab: tabProp, onTabChange, hideHeader, onOpenDiffBrowser, onOpenPRTab }: FileChangesViewProps) {
  const [tabLocal, setTabLocal] = useState<"files" | "changes" | "pr">("files")
  const tab = tabProp ?? tabLocal
  const setTab = onTabChange ?? setTabLocal
  const hasPR = !!agent.prNumber

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header — hidden when tabs are rendered in the workspace header */}
      {!hideHeader && (
        <div className="flex items-center px-2 py-2 border-b border-border shrink-0 gap-1">
          <button
            onClick={() => setTab("files")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              tab === "files"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
            )}
          >
            All files
          </button>

          <button
            onClick={() => setTab("changes")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              tab === "changes"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
            )}
          >
            Changes
            {agent.fileChanges.length > 0 && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                tab === "changes" ? "bg-background/60 text-foreground" : "bg-accent/60 text-muted-foreground"
              )}>
                {agent.fileChanges.length}
              </span>
            )}
          </button>

          {hasPR && (
            <button
              onClick={() => setTab("pr")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
                tab === "pr"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
              )}
            >
              <IconGitPullRequest size={12} />
              Pull request
            </button>
          )}

          <button className="ml-auto p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
            <IconSearch size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0">
        <UnifiedFileTree
          agentId={agent.id}
          repoId={agent.repoId ?? null}
          fileChanges={agent.fileChanges}
          onFileContentSelect={onFileContentSelect}
          onFileSelect={(file) => onFileSelect(file)}
          onOpenDiffBrowser={onOpenDiffBrowser}
          onOpenPRTab={onOpenPRTab}
          hasPR={hasPR}
          prView={<PRView agentId={agent.id} onAddComment={onAddComment} />}
          onAddComment={onAddComment}
          pendingComments={pendingComments}
          onRemoveComment={onRemoveComment}
        />
      </div>
    </div>
  )
}
