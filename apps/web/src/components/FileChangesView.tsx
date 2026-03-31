import { useState } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Agent, FileChange, PRDetails, PRReview, PRCheck, PRComment, PRThread } from "@/data/mock"
import { api } from "@hive/shared"
import {
  IconFileText,
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
  IconFolder,
  IconFiles,
} from "@tabler/icons-react"

// ── Changes list ──────────────────────────────────────────────────────────────

type FilterMode = "all" | "uncommitted"

function ChangesView({
  files,
  selectedFile,
  onFileSelect,
}: {
  files: FileChange[]
  selectedFile: string | null
  onFileSelect: (file: FileChange | null) => void
}) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all")
  const [filterOpen, setFilterOpen] = useState(false)

  return (
    <>
      {files.length > 0 && (
        <div className="relative shrink-0">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="w-full flex items-center justify-between px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors border-b border-border"
          >
            <span>{filterMode === "all" ? "All changes" : `Uncommitted changes · ${files.length} files`}</span>
            <IconChevronDown size={13} className={cn("transition-transform", filterOpen && "rotate-180")} />
          </button>

          {filterOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
              <div className="absolute top-full left-0 right-0 z-20 bg-card border border-border rounded-lg shadow-lg overflow-hidden mx-2 mt-1">
                {(["all", "uncommitted"] as FilterMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setFilterMode(mode); setFilterOpen(false) }}
                    className="w-full flex items-start justify-between px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-foreground">
                        {mode === "all" ? "All changes" : "Uncommitted changes"}
                      </div>
                      {mode === "uncommitted" && (
                        <div className="text-[12px] text-muted-foreground mt-0.5">{files.length} files changed</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {mode === "uncommitted" && (
                        <span className="text-[11px] text-muted-foreground/50 font-mono">⌥U</span>
                      )}
                      {filterMode === mode && <IconCheck size={14} className="text-foreground shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <IconFileText size={22} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/40">No file changes</p>
            </div>
          ) : (
            <div className="py-1">
              {files.map((file) => {
                const name = file.path.split("/").pop() ?? file.path
                const dir = file.path.split("/").slice(0, -1).join("/")
                const isSelected = selectedFile === file.path
                const isAddOnly = file.deletions === 0
                const isDelOnly = file.additions === 0

                return (
                  <button
                    key={file.path}
                    onClick={() => onFileSelect(isSelected ? null : file)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                      isSelected ? "bg-accent" : "hover:bg-accent/40"
                    )}
                  >
                    <div className="flex-1 min-w-0 flex items-baseline gap-1 truncate">
                      {dir && (
                        <span className="text-[12px] text-muted-foreground/60 truncate shrink-1 min-w-0">
                          {dir.length > 28 ? dir.slice(0, 28) + "…" : dir}/
                        </span>
                      )}
                      <span className="text-[12px] font-semibold text-foreground truncate shrink-0">{name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground/50 font-medium">U</span>
                      <span className="font-mono text-[11px]">
                        <span className="text-emerald-400">+{file.additions}</span>
                        {" "}
                        <span className="text-red-400">-{file.deletions}</span>
                      </span>
                      <span className={cn(
                        "w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] font-bold shrink-0",
                        isAddOnly
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : isDelOnly
                          ? "border-red-400/40 text-red-400 bg-red-400/10"
                          : "border-amber-400/40 text-amber-400 bg-amber-400/10"
                      )}>
                        {isAddOnly ? "+" : isDelOnly ? "−" : "M"}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  )
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

function ReviewIcon({ state }: { state: PRReview["state"] }) {
  switch (state) {
    case "APPROVED": return <IconCircleCheck size={14} className="text-emerald-400 shrink-0" />
    case "CHANGES_REQUESTED": return <IconCircleX size={14} className="text-red-400 shrink-0" />
    case "DISMISSED": return <IconCircleDashed size={14} className="text-zinc-400 shrink-0" />
    default: return <IconClock size={14} className="text-zinc-400 shrink-0" />
  }
}

function statusBanner(pr: PRDetails) {
  if (pr.merged)
    return { label: "Merged", cls: "bg-purple-500/10 border-purple-500/25 text-purple-400" }
  if (pr.draft)
    return { label: "Draft", cls: "bg-zinc-500/10 border-zinc-500/25 text-zinc-400" }
  if (pr.hasChangeRequests)
    return { label: "Changes requested", cls: "bg-orange-500/10 border-orange-500/25 text-orange-400" }
  if (pr.mergeableState === "dirty")
    return { label: "Merge conflict", cls: "bg-red-500/10 border-red-500/25 text-red-400" }
  if (pr.mergeableState === "blocked")
    return { label: "Blocked", cls: "bg-red-500/10 border-red-500/25 text-red-400" }
  if (pr.state === "open")
    return { label: "Ready to merge", cls: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" }
  return { label: "Closed", cls: "bg-zinc-500/10 border-zinc-500/25 text-zinc-400" }
}

function ThreadBlock({ thread, onAddComment }: { thread: PRThread; onAddComment: (c: PRComment) => void }) {
  const fileName = thread.path?.split("/").pop()
  const loc = fileName ? `${fileName}${thread.line ? `:${thread.line}` : ""}` : null

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      thread.isResolved
        ? "border-border/40 opacity-60"
        : "border-border"
    )}>
      {/* Thread header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border/50">
        {loc && (
          <span className="text-[11px] font-mono text-muted-foreground/70 truncate flex-1">{loc}</span>
        )}
        {thread.isOutdated && (
          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            Outdated
          </span>
        )}
        {thread.isResolved ? (
          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shrink-0">
            <IconCircleCheck size={10} /> Resolved
          </span>
        ) : (
          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            Open
          </span>
        )}
      </div>

      {/* Comments */}
      <div className="divide-y divide-border/30">
        {thread.comments.map((comment) => (
          <div key={comment.id} className={cn("group px-3 py-2 space-y-1", comment.isReply && "bg-muted/20 pl-7")}>
            <div className="flex items-center gap-1.5">
              {comment.isReply && (
                <span className="text-muted-foreground/30 text-[10px] -ml-3 mr-0.5">↳</span>
              )}
              {comment.avatarUrl && (
                <img src={comment.avatarUrl} alt={comment.author} className="w-3.5 h-3.5 rounded-full shrink-0" />
              )}
              <span className="text-[11px] font-medium text-foreground">{comment.author}</span>
              {comment.isReply && (
                <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wide">reply</span>
              )}
              <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!thread.isResolved && (
                  <button
                    onClick={() => onAddComment(comment)}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    Add to chat
                  </button>
                )}
                <a href={comment.url} target="_blank" rel="noreferrer" className="text-muted-foreground/30 hover:text-muted-foreground/60">
                  <IconArrowUpRight size={10} />
                </a>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-5 pl-5">
              {comment.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PRView({ agentId, onAddComment }: { agentId: string; onAddComment: (c: PRComment) => void }) {
  const [rerequesting, setRerequesting] = useState(false)
  const queryClient = useQueryClient()

  async function handleRerequestReview() {
    setRerequesting(true)
    try {
      await api.rerequestReview(agentId)
      queryClient.invalidateQueries({ queryKey: ["pr-details", agentId] })
      toast.success("Review re-requested")
    } catch (err) {
      toast.error(`Failed to re-request review: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setRerequesting(false)
    }
  }

  const { data: pr, isLoading, error } = useQuery({
    queryKey: ["pr-details", agentId],
    queryFn: () => api.getPRDetails(agentId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
        Loading…
      </div>
    )
  }

  if (error || !pr) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
        No PR data
      </div>
    )
  }

  const banner = statusBanner(pr)

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">

        {/* PR title + link */}
        <div className="space-y-1.5">
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-1.5 group"
          >
            <span className="text-[13px] font-medium text-foreground leading-snug group-hover:underline">
              {pr.title}
            </span>
            <IconArrowUpRight size={12} className="text-muted-foreground/50 shrink-0 mt-0.5" />
          </a>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/60 font-mono">#{pr.number}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[11px] text-muted-foreground/60">{pr.author}</span>
          </div>
        </div>

        {/* Status banner */}
        <div className={cn("flex items-center justify-center px-3 py-2 rounded-lg border text-[12px] font-medium", banner.cls)}>
          {banner.label}
        </div>

        {/* Re-request review */}
        {(pr.hasChangeRequests || pr.hasDismissedReviews) && !pr.merged && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-[12px]"
            onClick={handleRerequestReview}
            disabled={rerequesting}
          >
            {rerequesting ? "Re-requesting…" : "Re-request review"}
          </Button>
        )}

        {/* Reviews */}
        {pr.reviews.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Reviews</div>
            <div className="space-y-1.5">
              {pr.reviews.map((review) => (
                <div key={review.author} className="flex items-center gap-2">
                  <ReviewIcon state={review.state} />
                  {review.avatarUrl && (
                    <img src={review.avatarUrl} alt={review.author} className="w-4 h-4 rounded-full" />
                  )}
                  <span className="text-[12px] text-foreground flex-1">{review.author}</span>
                  <span className={cn(
                    "text-[10px] font-medium uppercase tracking-wide",
                    review.state === "APPROVED" && "text-emerald-400",
                    review.state === "CHANGES_REQUESTED" && "text-red-400",
                    review.state === "DISMISSED" && "text-zinc-400",
                    review.state === "PENDING" && "text-zinc-400",
                  )}>
                    {review.state === "CHANGES_REQUESTED" ? "Changes" : review.state.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checks */}
        {pr.checks.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Checks</div>
            <div className="space-y-1.5">
              {pr.checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckIcon check={check} />
                  <span className="text-[12px] text-foreground flex-1 truncate">{check.name}</span>
                  {check.url && (
                    <a href={check.url} target="_blank" rel="noreferrer" className="text-muted-foreground/40 hover:text-muted-foreground">
                      <IconArrowUpRight size={11} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review threads */}
        {pr.threads.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Review threads
              <span className="ml-1.5 text-muted-foreground/50 normal-case font-normal">{pr.threads.length}</span>
            </div>
            <div className="space-y-2">
              {pr.threads.map((thread) => (
                <ThreadBlock key={thread.id} thread={thread} onAddComment={onAddComment} />
              ))}
            </div>
          </div>
        )}

        {/* General discussion comments */}
        {pr.issueComments.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Discussion
              <span className="ml-1.5 text-muted-foreground/50 normal-case font-normal">{pr.issueComments.length}</span>
            </div>
            <div className="space-y-3">
              {pr.issueComments.map((c) => (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    {c.avatarUrl && <img src={c.avatarUrl} alt={c.author} className="w-4 h-4 rounded-full" />}
                    <span className="text-[12px] font-medium text-foreground">{c.author}</span>
                    <a href={c.url} target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground/30 hover:text-muted-foreground/60">
                      <IconArrowUpRight size={11} />
                    </a>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed pl-5 whitespace-pre-wrap line-clamp-4">
                    {c.body}
                  </p>
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

// ── All files tree ───────────────────────────────────────────────────────────

interface FileTreeEntry {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileTreeEntry[]
}

function fileColor(name: string): string {
  // Exact filename matches first
  const lower = name.toLowerCase()
  const nameMap: Record<string, string> = {
    ".gitignore": "text-red-500",
    ".git": "text-zinc-500",
    ".env": "text-yellow-500",
    "dockerfile": "text-sky-400",
    "license": "text-zinc-400",
    "readme.md": "text-zinc-400",
  }
  if (nameMap[lower]) return nameMap[lower]

  const ext = name.split(".").pop()?.toLowerCase()
  const colorMap: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400",
    js: "text-yellow-400", jsx: "text-yellow-400",
    json: "text-amber-400",
    md: "text-sky-400",
    css: "text-pink-400", scss: "text-pink-400",
    html: "text-orange-400",
    yaml: "text-green-400", yml: "text-green-400",
    sh: "text-emerald-500",
    lock: "text-zinc-600",
    toml: "text-zinc-400",
    svg: "text-amber-300",
    png: "text-purple-400", jpg: "text-purple-400", gif: "text-purple-400",
    env: "text-yellow-500",
    sql: "text-orange-300",
    graphql: "text-pink-500",
    py: "text-yellow-300",
    go: "text-cyan-400",
    rs: "text-orange-400",
    rb: "text-red-400",
  }
  return colorMap[ext ?? ""] ?? "text-zinc-500"
}

function TreeNode({
  entry,
  depth,
  onSelect,
}: {
  entry: FileTreeEntry
  depth: number
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 1)

  if (entry.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-1.5 px-4 py-[3px] text-left hover:bg-accent/40 transition-colors"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <IconChevronRight size={11} className={cn("text-muted-foreground/40 shrink-0 transition-transform", open && "rotate-90")} />
          <IconFolder size={14} className="text-muted-foreground/50 shrink-0" />
          <span className="text-[12px] text-muted-foreground truncate">{entry.name}</span>
        </button>
        {open && entry.children?.map((child) => (
          <TreeNode key={child.path} entry={child} depth={depth + 1} onSelect={onSelect} />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className="w-full flex items-center gap-1.5 px-4 py-[3px] text-left hover:bg-accent/40 transition-colors"
      style={{ paddingLeft: `${26 + depth * 16}px` }}
    >
      <span className={cn("text-[10px] shrink-0 leading-none", fileColor(entry.name))}>◆</span>
      <span className="text-[12px] text-muted-foreground truncate">{entry.name}</span>
    </button>
  )
}

function AllFilesView({
  agentId,
  onFileContentSelect,
}: {
  agentId: string
  onFileContentSelect: (path: string) => void
}) {
  const { data: tree, isLoading } = useQuery({
    queryKey: ["file-tree", agentId],
    queryFn: () => api.getFileTree(agentId),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-xs text-muted-foreground/40">Loading…</p>
      </div>
    )
  }

  if (!tree || tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <IconFiles size={22} className="text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/40">No files</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0">
      <ScrollArea className="h-full">
        <div className="py-1">
          {tree.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry as FileTreeEntry}
              depth={0}
              onSelect={onFileContentSelect}
            />
          ))}
        </div>
      </ScrollArea>
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
}

export function FileChangesView({ agent, selectedFile, onFileSelect, onFileContentSelect, onAddComment }: FileChangesViewProps) {
  const [tab, setTab] = useState<"files" | "changes" | "pr">("files")
  const hasPR = !!agent.prNumber

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center px-4 py-2.5 border-b border-border shrink-0 gap-4">
        <button
          onClick={() => setTab("files")}
          className={cn(
            "flex items-center gap-1.5 text-[12px] font-medium transition-colors pb-0.5",
            tab === "files"
              ? "text-foreground border-b-2 border-foreground -mb-px"
              : "text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px"
          )}
        >
          All files
        </button>

        <button
          onClick={() => setTab("changes")}
          className={cn(
            "flex items-center gap-1.5 text-[12px] font-medium transition-colors pb-0.5",
            tab === "changes"
              ? "text-foreground border-b-2 border-foreground -mb-px"
              : "text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px"
          )}
        >
          Changes
          {agent.fileChanges.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-secondary text-muted-foreground">
              {agent.fileChanges.length}
            </span>
          )}
        </button>

        {hasPR && (
          <button
            onClick={() => setTab("pr")}
            className={cn(
              "flex items-center gap-1.5 text-[12px] font-medium transition-colors pb-0.5",
              tab === "pr"
                ? "text-foreground border-b-2 border-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px"
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

      <div className="flex flex-col flex-1 min-h-0">
        {tab === "files" ? (
          <AllFilesView agentId={agent.id} onFileContentSelect={onFileContentSelect} />
        ) : tab === "changes" ? (
          <ChangesView
            files={agent.fileChanges}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        ) : (
          <PRView agentId={agent.id} onAddComment={onAddComment} />
        )}
      </div>
    </div>
  )
}
