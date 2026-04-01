import { useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ScrollArea } from "@hive/ui"
import { Button } from "@hive/ui"
import { cn } from "@hive/ui"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@hive/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hive/ui"
import type { PullRequest, ReviewComment, PRFile } from "@/data/mockReviews"
import { mockReviewResults, mockFileDiffs } from "@/data/mockReviews"
import {
  IconSend,
  IconPlus,
  IconBrain,
  IconPaperclip,
  IconPlayerStop,
  IconSparkles,
  IconEye,
  IconGitPullRequest,
  IconCheck,
  IconBrandGithub,
  IconAlertCircle,
  IconBulb,
  IconMessageCircle,
  IconRefresh,
  IconFileCode,
  IconPlus as IconPlusFile,
  IconMinus,
  IconArrowLeft,
  IconX,
} from "@tabler/icons-react"

// ── Constants ─────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "claude-opus-4-6",           label: "Opus 4.6" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  isReview?: boolean
  comments?: ReviewComment[]
  timestamp: string
}

// ── Markdown ──────────────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
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
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-[13px]">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-medium text-foreground mb-1">{children}</h3>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ── Review comment card ───────────────────────────────────────────────────────

const severityConfig = {
  blocking:   { border: "border-red-500/25",    dot: "bg-red-400",              label: "Blocking",    labelColor: "text-red-400",              icon: IconAlertCircle,   iconColor: "text-red-400/70" },
  suggestion: { border: "border-amber-500/25",  dot: "bg-amber-400",            label: "Suggestion",  labelColor: "text-amber-400",            icon: IconBulb,          iconColor: "text-amber-400/70" },
  nit:        { border: "border-border",        dot: "bg-muted-foreground/30",  label: "Nit",         labelColor: "text-muted-foreground/50",  icon: IconMessageCircle, iconColor: "text-muted-foreground/40" },
}

function ReviewCommentCard({
  comment,
  onDismiss,
  onSend,
  onRevert,
}: {
  comment: ReviewComment
  onDismiss: (id: string) => void
  onSend: (id: string) => void
  onRevert: (id: string) => void
}) {
  const cfg = severityConfig[comment.severity]
  const Icon = cfg.icon
  const isDismissed = comment.status === "dismissed"
  const isSent = comment.status === "sent"

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden transition-opacity",
      cfg.border,
      isDismissed && "opacity-35"
    )}>
      {/* File + severity header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-secondary/40">
        <Icon size={11} className={cn("shrink-0", cfg.iconColor)} />
        {comment.type === "inline" && comment.path ? (
          <code className="text-[11px] font-mono text-muted-foreground truncate flex-1">
            {comment.path}
            {comment.line && <span className="text-muted-foreground/40">:{comment.line}</span>}
          </code>
        ) : (
          <span className="text-[11px] text-muted-foreground flex-1">General comment</span>
        )}
        <span className={cn("text-[10px] font-medium uppercase tracking-wide shrink-0", cfg.labelColor)}>
          {cfg.label}
        </span>
      </div>

      {/* Code context */}
      {comment.codeContext && comment.codeContext.length > 0 && (
        <div className="bg-[#0d0d0d] border-b border-border/50 overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <tbody>
              {comment.codeContext.map((line) => (
                <tr
                  key={line.lineNumber}
                  className={cn(
                    line.highlighted
                      ? "bg-amber-500/10 text-foreground"
                      : "text-muted-foreground/50"
                  )}
                >
                  <td className={cn(
                    "select-none text-right pr-3 pl-3 py-0.5 w-10 shrink-0 border-r text-[10px] tabular-nums",
                    line.highlighted ? "border-amber-500/30 text-amber-500/60" : "border-border/30 text-muted-foreground/25"
                  )}>
                    {line.lineNumber}
                  </td>
                  <td className={cn(
                    "pl-3 pr-4 py-0.5 whitespace-pre",
                    line.highlighted && "text-foreground/90"
                  )}>
                    {line.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Comment body + actions */}
      <div className="px-3 py-2.5">
        <p className="text-[12.5px] text-foreground/90 leading-relaxed mb-2.5">{comment.body}</p>

        {comment.status === "pending" && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 text-muted-foreground/50 hover:text-foreground"
              onClick={() => onDismiss(comment.id)}
            >
              Dismiss
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2.5 gap-1.5 ml-auto"
              onClick={() => onSend(comment.id)}
            >
              <IconBrandGithub size={11} />
              {comment.type === "inline" ? "Send inline" : "Send comment"}
            </Button>
          </div>
        )}
        {isSent && (
          <div className="flex items-center gap-1 text-[11px] text-emerald-400">
            <IconCheck size={11} />
            Sent to GitHub
          </div>
        )}
        {isDismissed && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/30">Dismissed</span>
            <button
              onClick={() => onRevert(comment.id)}
              className="text-[11px] text-muted-foreground/40 hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function ReviewingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-6 h-6 rounded-md bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
        <IconEye size={12} className="text-muted-foreground/60" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground/60 mb-2">Reviewing changes…</div>
        <div className="flex items-center gap-[4px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"
              style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Chat message ──────────────────────────────────────────────────────────────

function Message({
  message,
  onDismiss,
  onSend,
  onRevert,
}: {
  message: ChatMessage
  onDismiss: (id: string) => void
  onSend: (id: string) => void
  onRevert: (id: string) => void
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4 py-2">
        <div className="max-w-[80%] bg-secondary border border-border rounded-2xl rounded-tr-sm px-3.5 py-2.5">
          <p className="text-[13px] text-foreground leading-relaxed">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-6 h-6 rounded-md bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
        <IconEye size={12} className="text-muted-foreground/60" />
      </div>
      <div className="flex-1 min-w-0 text-[13px] text-foreground">
        <MarkdownContent content={message.content} />

        {message.isReview && message.comments && message.comments.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                {message.comments.length} comment{message.comments.length !== 1 ? "s" : ""}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {message.comments.map((c) => (
              <ReviewCommentCard key={c.id} comment={c} onDismiss={onDismiss} onSend={onSend} onRevert={onRevert} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Diff panel ────────────────────────────────────────────────────────────────

type DiffLine = { type: "add" | "del" | "ctx" | "hunk"; text: string; lineNo?: number }

function parseDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let addNo = 1, delNo = 1
  for (const line of raw.split("\n")) {
    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+).*\+(\d+)/)
      if (m) { delNo = parseInt(m[1]); addNo = parseInt(m[2]) }
      lines.push({ type: "hunk", text: line })
    } else if (line.startsWith("+")) {
      lines.push({ type: "add", text: line.slice(1), lineNo: addNo++ })
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", text: line.slice(1), lineNo: delNo++ })
    } else if (line.startsWith(" ")) {
      lines.push({ type: "ctx", text: line.slice(1), lineNo: addNo++ }); delNo++
    }
  }
  return lines
}

function PRDiffPanel({ file, onClose }: { file: PRFile; onClose: () => void }) {
  const raw = mockFileDiffs[file.path]
  const lines = raw ? parseDiff(raw) : []
  const fileName = file.path.split("/").pop() ?? file.path

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
          <IconArrowLeft size={13} />
        </button>
        <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">
          {file.path.replace(`/${fileName}`, "")}/<span className="text-foreground font-semibold">{fileName}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
          <span className="text-emerald-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground/30 text-[12px]">
          Diff preview not available
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="text-[11px] font-mono">
            {lines.map((line, i) => {
              if (line.type === "hunk") {
                return (
                  <div key={i} className="px-3 py-1 bg-secondary/60 text-muted-foreground/50 border-y border-border/40">
                    {line.text}
                  </div>
                )
              }
              const bg = line.type === "add" ? "bg-emerald-500/8" : line.type === "del" ? "bg-red-500/8" : ""
              const prefix = line.type === "add" ? "+" : line.type === "del" ? "-" : " "
              const prefixColor = line.type === "add" ? "text-emerald-400/60" : line.type === "del" ? "text-red-400/60" : "text-muted-foreground/20"
              return (
                <div key={i} className={cn("flex items-start group", bg)}>
                  <span className="w-8 shrink-0 text-right pr-2 py-0.5 text-muted-foreground/20 select-none border-r border-border/20 text-[10px]">
                    {line.lineNo}
                  </span>
                  <span className={cn("w-4 shrink-0 text-center py-0.5 select-none", prefixColor)}>{prefix}</span>
                  <span className={cn(
                    "flex-1 py-0.5 pr-4 whitespace-pre-wrap break-all",
                    line.type === "add" ? "text-emerald-100/80" : line.type === "del" ? "text-red-100/60 line-through decoration-red-400/30" : "text-foreground/70"
                  )}>
                    {line.text}
                  </span>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

// ── Changed files panel ───────────────────────────────────────────────────────

function PRFilesPanel({ pr, onFileSelect }: { pr: PullRequest; onFileSelect: (f: PRFile) => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Changed files</span>
          <span className="text-[11px] font-mono text-muted-foreground/40">{pr.files.length}</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {pr.files.map((file) => (
            <div key={file.path} onClick={() => onFileSelect(file)} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors cursor-pointer group">
              <IconFileCode size={11} className="text-muted-foreground/30 shrink-0" />
              <span className="text-[11px] font-mono text-muted-foreground flex-1 min-w-0 truncate">
                {file.path.split("/").pop()}
              </span>
              <div className="flex items-center gap-1.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                {file.additions > 0 && (
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5">
                    <IconPlusFile size={9} />
                    {file.additions}
                  </span>
                )}
                {file.deletions > 0 && (
                  <span className="text-[10px] font-mono text-red-400 flex items-center gap-0.5">
                    <IconMinus size={9} />
                    {file.deletions}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── PR info panel ─────────────────────────────────────────────────────────────

function PRInfoPanel({ pr }: { pr: PullRequest }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">PR info</span>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto">
        <div>
          <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Branch</div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground flex-wrap">
            <span className="text-foreground/80">{pr.branch}</span>
            <span className="text-muted-foreground/30">→</span>
            <span>{pr.baseBranch}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Author</div>
          <span className="text-[11px] text-muted-foreground">{pr.author}</span>
        </div>
        <div>
          <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Changes</div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-emerald-400">+{pr.additions}</span>
            <span className="text-red-400">-{pr.deletions}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Description</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{pr.description}</p>
        </div>
        <Button variant="outline" size="sm" className="w-full gap-1.5 text-[11px]">
          <IconBrandGithub size={12} />
          View on GitHub
        </Button>
      </div>
    </div>
  )
}

// ── Main PRView ───────────────────────────────────────────────────────────────

interface PRViewProps {
  pr: PullRequest
}

export function PRView({ pr }: PRViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [model, setModel] = useState("claude-sonnet-4-6")
  const [thinking, setThinking] = useState(false)
  const [activeTab, setActiveTab] = useState<"chat" | "file">("chat")
  const [openFileTab, setOpenFileTab] = useState<PRFile | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    if (!pr.unread) triggerReview()
  }, [])

  function triggerReview() {
    setReviewing(true)
    setTimeout(() => {
      const result = mockReviewResults[pr.id]
      const msg: ChatMessage = {
        id: `review-${Date.now()}`,
        role: "assistant",
        content: result?.summary ?? "I've reviewed the pull request. No major issues found.",
        isReview: true,
        comments: result?.comments.map((c) => ({ ...c })) ?? [],
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, msg])
      setReviewing(false)
      setHasReviewed(true)
    }, 2200)
  }

  function handleReview() {
    if (reviewing || isSending) return
    triggerReview()
  }

  async function handleSend() {
    const content = input.trim()
    if (!content || isSending || reviewing) return
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsSending(true)
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "I can see the code in this branch. Let me look into that for you.",
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsSending(false)
    }, 1000)
  }

  function openFile(file: PRFile) {
    setOpenFileTab(file)
    setActiveTab("file")
  }

  function closeFileTab() {
    setActiveTab("chat")
    setOpenFileTab(null)
  }

  function updateCommentStatus(commentId: string, status: ReviewComment["status"]) {
    setMessages((prev) =>
      prev.map((m) =>
        m.isReview && m.comments
          ? { ...m, comments: m.comments.map((c) => c.id === commentId ? { ...c, status } : c) }
          : m
      )
    )
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, reviewing, isSending])

  // Auto-resize textarea
  function handleInputChange(val: string) {
    setInput(val)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }

  const canSend = input.trim().length > 0 && !isSending && !reviewing
  const pendingCount = messages.flatMap((m) => m.comments ?? []).filter((c) => c.status === "pending").length
  const sentCount = messages.flatMap((m) => m.comments ?? []).filter((c) => c.status === "sent").length

  return (
    <div className="flex flex-col h-full">
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">

        {/* ── Left: Chat ── */}
        <ResizablePanel defaultSize={62} minSize={40}>
          <div className="flex flex-col h-full">

            {/* PR header */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                  <IconGitPullRequest size={12} className="text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono text-muted-foreground/40">#{pr.number}</span>
                    <span className="text-[13px] font-semibold text-foreground truncate">{pr.title}</span>
                    {pr.reviewStatus === "changes-requested" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium shrink-0">
                        Changes requested
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground/40">
                    <span>{pr.author}</span>
                    <span>·</span>
                    <span className="font-mono">{pr.branch}</span>
                    <span>→</span>
                    <span className="font-mono">{pr.baseBranch}</span>
                    <span>·</span>
                    <span>{pr.requestedAt}</span>
                    {hasReviewed && pendingCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-amber-400">{pendingCount} pending</span>
                        {sentCount > 0 && <span className="text-emerald-400">, {sentCount} sent</span>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center border-b border-border shrink-0 px-2">
              <div
                onClick={() => setActiveTab("chat")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px cursor-pointer",
                  activeTab === "chat"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <IconEye size={12} className="shrink-0" />
                Review
              </div>
              {openFileTab && (
                <button
                  onClick={() => setActiveTab("file")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px",
                    activeTab === "file"
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <IconFileCode size={12} />
                  <span>{openFileTab.path.split("/").pop()}</span>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); closeFileTab() }}
                    className="ml-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                  >
                    <IconX size={11} />
                  </span>
                </button>
              )}
            </div>

            {/* File diff tab content */}
            {activeTab === "file" && openFileTab && (
              <div className="flex-1 min-h-0">
                <PRDiffPanel file={openFileTab} onClose={closeFileTab} />
              </div>
            )}

            {activeTab === "chat" && <>
            {/* Re-review banner */}
            {pr.unread && !hasReviewed && (
              <div className="mx-4 mt-3 shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-secondary border border-border">
                <IconRefresh size={13} className="text-muted-foreground/60 shrink-0" />
                <span className="text-[12px] text-muted-foreground flex-1">
                  <span className="text-foreground font-medium">{pr.author}</span> requested a re-review after your last comments.
                </span>
                <Button size="sm" className="h-6 text-[11px] px-2.5 gap-1 shrink-0" onClick={handleReview}>
                  <IconEye size={11} />
                  Re-review
                </Button>
              </div>
            )}

            {/* Empty state */}
            {messages.length === 0 && !reviewing && !pr.unread && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground/20 space-y-2">
                  <IconEye size={24} className="mx-auto" />
                  <p className="text-[12px]">Starting review…</p>
                </div>
              </div>
            )}

            {/* Messages */}
            {(messages.length > 0 || reviewing) && (
              <ScrollArea className="flex-1 min-h-0">
                <div className="py-3">
                  {messages.map((msg) => (
                    <Message
                      key={msg.id}
                      message={msg}
                      onDismiss={(id) => updateCommentStatus(id, "dismissed")}
                      onSend={(id) => updateCommentStatus(id, "sent")}
                      onRevert={(id) => updateCommentStatus(id, "pending")}
                    />
                  ))}
                  {(reviewing || isSending) && <ReviewingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            )}

            {/* Input — same structure as ChatView, minus plan mode */}
            <div className="p-4 shrink-0">
              <div className="border border-border focus-within:border-ring bg-card rounded-xl transition-colors">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={messages.length === 0 ? "Ask about this PR or the code…" : "Add a follow up"}
                  rows={2}
                  disabled={reviewing}
                  className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <div className="flex items-center justify-between px-3 pb-3">
                  <div className="flex items-center gap-1">
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger className="h-auto border-0 shadow-none bg-transparent px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground gap-1.5 focus:ring-0 [&>svg]:hidden">
                        <IconSparkles size={13} className="text-muted-foreground shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setThinking(!thinking)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
                        thinking ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground/60"
                      )}
                    >
                      <IconBrain size={13} />
                      <span>Thinking</span>
                    </button>
                    <button
                      onClick={handleReview}
                      disabled={reviewing}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
                        reviewing ? "opacity-40 cursor-not-allowed" : "hover:bg-accent text-muted-foreground/60"
                      )}
                    >
                      <IconEye size={13} />
                      <span>{hasReviewed ? "Re-review" : "Review"}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
                      <IconPaperclip size={13} />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
                      <IconPlus size={13} />
                    </Button>
                    {reviewing || isSending ? (
                      <Button size="icon-xs" variant="destructive" disabled>
                        <IconPlayerStop size={13} />
                      </Button>
                    ) : (
                      <Button
                        size="icon-xs"
                        variant={canSend ? "default" : "secondary"}
                        disabled={!canSend}
                        onClick={handleSend}
                      >
                        <IconSend size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </>}

          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* ── Right: Files + Info ── */}
        <ResizablePanel defaultSize={38} minSize={25}>
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={60} minSize={30}>
              <PRFilesPanel pr={pr} onFileSelect={openFile} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={40} minSize={20}>
              <PRInfoPanel pr={pr} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  )
}
