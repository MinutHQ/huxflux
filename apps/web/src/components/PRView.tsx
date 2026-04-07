import { useState, useEffect, useRef, useCallback } from "react"
import { isTauri } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ScrollArea } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { cn } from "@huxflux/ui"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import type { PullRequest, ReviewComment, PRFile } from "@/data/mockReviews"
import { mockReviewResults } from "@/data/mockReviews"
import { api } from "@huxflux/shared"
import { toast } from "sonner"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref, getDesktopNotif } from "@/lib/notificationPrefs"
import type { PRThread } from "@huxflux/shared"
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
  IconLoader2,
  IconMessageCircle2,
  IconLayoutColumns,
  IconLayoutRows,
  IconChevronDown,
} from "@tabler/icons-react"
import { FileDiff } from "@pierre/diffs/react"
import { processFile, trimPatchContext } from "@pierre/diffs"
import { useQuery } from "@tanstack/react-query"
import type { ExpansionDirections, HunkExpansionRegion } from "@pierre/diffs/react"

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
  verdict?: "approve" | "request_changes" | "comment"
  comments?: ReviewComment[]
  timestamp: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseReviewJson(text: string): { summary: string; verdict: string; comments: any[] } | null {
  const matches = [...text.matchAll(/```json\s*\n([\s\S]+?)\n```/g)]
  if (matches.length === 0) return null
  try {
    const data = JSON.parse(matches[matches.length - 1][1])
    if (typeof data.summary !== "string" || !Array.isArray(data.comments)) return null
    return data
  } catch { return null }
}

function buildCodeContext(patch: string, targetLine: number): { lineNumber: number; content: string; highlighted?: boolean }[] {
  if (!patch) return []
  const lines = patch.split("\n")
  let newLineNum = 0
  const allLines: { lineNumber: number; content: string }[] = []
  for (const line of lines) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (m) { newLineNum = parseInt(m[1], 10) - 1; continue }
    if (line.startsWith("-")) continue
    if (line.startsWith("+") || line.startsWith(" ")) {
      newLineNum++
      allLines.push({ lineNumber: newLineNum, content: line.slice(1) })
    }
  }
  const idx = allLines.findIndex((l) => l.lineNumber === targetLine)
  if (idx === -1) return []
  const start = Math.max(0, idx - 3)
  const end = Math.min(allLines.length - 1, idx + 3)
  return allLines.slice(start, end + 1).map((l) => ({ ...l, highlighted: l.lineNumber === targetLine }))
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
  onResolve,
}: {
  comment: ReviewComment
  onDismiss: (id: string) => void
  onSend: (id: string) => Promise<void>
  onRevert: (id: string) => void
  onResolve: (id: string) => void
}) {
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  async function handleSend() {
    setSending(true)
    setSendError(null)
    try {
      await onSend(comment.id)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const cfg = severityConfig[comment.severity]
  const Icon = cfg.icon
  const isDismissed = comment.status === "dismissed"

  if (comment.resolved) {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 opacity-50">
          <IconCheck size={11} className="text-emerald-400 shrink-0" />
          <span className="text-[11px] text-muted-foreground/60 flex-1 truncate">
            {comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ""}` : "General comment"} · Resolved
          </span>
          <button
            onClick={() => onResolve(comment.id)}
            className="text-[11px] text-muted-foreground/40 hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Unresolve
          </button>
        </div>
      </div>
    )
  }

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
          <table className="min-w-full text-[11px] font-mono">
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
        <div className="text-[12.5px] text-foreground/90 leading-relaxed mb-2.5">
          <MarkdownContent content={comment.body} />
        </div>

        {(comment.status === "pending" || comment.status === "queued") && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-muted-foreground/50 hover:text-foreground"
                onClick={() => onDismiss(comment.id)}
              >
                Dismiss
              </Button>
              <button
                onClick={() => onResolve(comment.id)}
                className="h-6 text-[11px] px-2 text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                Resolve
              </button>
              {comment.status === "queued" ? (
                <div className="flex items-center gap-1 text-[11px] text-blue-400 ml-auto">
                  <IconCheck size={11} /> Queued
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2.5 gap-1.5 ml-auto"
                  disabled={sending}
                  onClick={handleSend}
                >
                  {sending
                    ? <IconLoader2 size={11} className="animate-spin" />
                    : <IconBrandGithub size={11} />}
                  {comment.type === "inline" ? "Send inline" : "Send comment"}
                </Button>
              )}
            </div>
            {sendError && (
              <p className="text-[11px] text-destructive">{sendError}</p>
            )}
          </div>
        )}
        {comment.status === "sent" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[11px] text-emerald-400">
              <IconCheck size={11} /> Sent
            </div>
            <button
              onClick={() => onResolve(comment.id)}
              className="text-[11px] text-muted-foreground/40 hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Resolve
            </button>
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
            <button
              onClick={() => onResolve(comment.id)}
              className="text-[11px] text-muted-foreground/40 hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Resolve
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────

const REVIEW_STEPS = [
  { label: "Fetching diff", icon: "⇣" },
  { label: "Building prompt", icon: "⊞" },
  { label: "Starting review", icon: "⊕" },
  { label: "Reviewing", icon: "◈" },
  { label: "Analyzing code", icon: "⧉" },
  { label: "Forming conclusions", icon: "⇄" },
]


function ReviewingView({ pr, currentStep }: { pr: PullRequest; currentStep: number }) {
  // visibleSteps: all steps up to and including currentStep are shown
  const visibleSteps = currentStep + 1
  // completedSteps: all steps before currentStep are done
  const completedSteps = currentStep

  const progress = Math.min(((completedSteps + 0.5) / REVIEW_STEPS.length) * 100, 92)
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i, x: ((i * 41 + 17) % 100), y: ((i * 59 + 11) % 100),
    size: 1.5 + (i % 3), duration: 2.5 + (i % 4) * 1.1,
    delay: (i % 8) * 0.35, opacity: 0.08 + (i % 4) * 0.06,
  }))

  return (
    <div className="relative flex flex-col items-center justify-center flex-1 gap-5 px-8 overflow-hidden">
      <style>{`
        @keyframes rv-float { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-8px) rotate(2deg)} }
        @keyframes rv-particle { 0%{transform:translateY(0) scale(1);opacity:var(--p-op)} 50%{transform:translateY(-20px) scale(1.3);opacity:calc(var(--p-op)*2)} 100%{transform:translateY(0) scale(1);opacity:var(--p-op)} }
        @keyframes rv-fade-up { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rv-ring { 0%{transform:scale(0.8);opacity:0.4} 100%{transform:scale(2.4);opacity:0} }
        @keyframes rv-glow { 0%,100%{box-shadow:0 0 20px rgba(96,165,250,0.06)} 50%{box-shadow:0 0 30px rgba(96,165,250,0.18)} }
        @keyframes rv-orbit { from{transform:rotate(0deg) translateX(34px) rotate(0deg)} to{transform:rotate(360deg) translateX(34px) rotate(-360deg)} }
        @keyframes rv-orbit2 { from{transform:rotate(120deg) translateX(26px) rotate(-120deg)} to{transform:rotate(480deg) translateX(26px) rotate(-480deg)} }
        @keyframes rv-scan { 0%{top:0%;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{top:100%;opacity:0} }
        @keyframes rv-assemble { 0%{opacity:0;transform:scale(0.3) rotate(-180deg)} 60%{opacity:1;transform:scale(1.1) rotate(8deg)} 100%{opacity:1;transform:scale(1) rotate(0deg)} }
        @keyframes rv-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes rv-step-in { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes rv-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes rv-check { from{stroke-dashoffset:16} to{stroke-dashoffset:0} }
        @keyframes rv-progress { from{width:0%} to{width:var(--rv-progress)} }
      `}</style>

      {particles.map((p) => (
        <div key={p.id} className="absolute rounded-full pointer-events-none" style={{
          left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size,
          backgroundColor: p.id % 3 === 0 ? "rgb(96,165,250)" : p.id % 3 === 1 ? "rgb(167,139,250)" : "rgb(52,211,153)",
          ["--p-op" as string]: p.opacity, opacity: p.opacity,
          animation: `rv-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
        }} />
      ))}

      <div className="relative z-10" style={{ animation: "rv-float 3.5s ease-in-out infinite" }}>
        <div className="absolute inset-0 rounded-2xl border-2 border-blue-400/20" style={{ animation: "rv-ring 2.5s ease-out infinite" }} />
        <div className="absolute inset-0 rounded-2xl border-2 border-violet-400/15" style={{ animation: "rv-ring 2.5s ease-out 0.9s infinite" }} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ animation: "rv-orbit 4s linear infinite" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400/60" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ animation: "rv-orbit2 5.5s linear infinite" }}>
            <div className="w-1 h-1 rounded-full bg-violet-400/50" />
          </div>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-card border border-blue-400/20 flex items-center justify-center relative overflow-hidden" style={{ animation: "rv-glow 2.5s ease-in-out infinite" }}>
          <div className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-400/40 to-transparent pointer-events-none" style={{ animation: "rv-scan 2s ease-in-out infinite" }} />
          <div style={{ animation: "rv-assemble 0.8s ease-out both" }}>
            <IconEye size={28} className="text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.6)]" />
          </div>
        </div>
      </div>

      <div className="text-center z-10" style={{ animation: "rv-fade-up 0.6s ease-out 0.2s both" }}>
        <p className="text-sm font-semibold bg-clip-text text-transparent" style={{
          backgroundImage: "linear-gradient(90deg, var(--foreground) 0%, var(--foreground) 30%, rgba(96,165,250,0.9) 50%, var(--foreground) 70%, var(--foreground) 100%)",
          backgroundSize: "200% 100%",
          animation: "rv-shimmer 3s ease-in-out infinite",
          WebkitBackgroundClip: "text",
        }}>
          {pr.title}
        </p>
        <p className="text-[11px] text-muted-foreground/50 mt-1 font-mono">{pr.branch || pr.repo}</p>
      </div>

      <div className="w-full max-w-xs z-10 rounded-xl overflow-hidden border border-border/60 bg-card/80 backdrop-blur-sm" style={{ animation: "rv-fade-up 0.6s ease-out 0.5s both" }}>
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 bg-secondary/40">
          <div className="w-2 h-2 rounded-full bg-red-400/40" />
          <div className="w-2 h-2 rounded-full bg-yellow-400/40" />
          <div className="w-2 h-2 rounded-full bg-green-400/40" />
          <span className="text-[9px] text-muted-foreground/40 font-mono ml-1.5">{pr.repo}</span>
        </div>
        <div className="px-3 py-2.5 space-y-1.5">
          {REVIEW_STEPS.slice(0, visibleSteps).map((step, i) => {
            const isDone = i < completedSteps
            const isCurrent = i === visibleSteps - 1 && !isDone
            return (
              <div key={i} className="flex items-center gap-2 text-[11px] font-mono" style={{ animation: "rv-step-in 0.3s ease-out both" }}>
                <span className="text-muted-foreground/40 shrink-0">{step.icon}</span>
                <span className={cn("flex-1 transition-colors duration-300",
                  isDone ? "text-muted-foreground/40" : isCurrent ? "text-blue-400/90" : "text-foreground/70"
                )}>{step.label}</span>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-emerald-400">
                    <path d="M3 6.5L5 8.5L9 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" style={{ animation: "rv-check 0.3s ease-out both" }} />
                  </svg>
                ) : isCurrent ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-blue-400" style={{ animation: "rv-spin 1s linear infinite" }}>
                    <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 15" strokeLinecap="round" />
                  </svg>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="h-1 bg-secondary/60">
          <div className="h-full bg-gradient-to-r from-blue-500/70 to-violet-500/70 transition-all duration-700 ease-out rounded-full"
            style={{ ["--rv-progress" as string]: `${progress}%`, width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Initial loading screen (shown while PR details are being fetched) ────────

function PRLoadingView({ pr }: { pr: PullRequest }) {
  const particles = Array.from({ length: 16 }, (_, i) => ({
    id: i, x: ((i * 41 + 17) % 100), y: ((i * 59 + 11) % 100),
    size: 1 + (i % 3) * 0.5, duration: 3 + (i % 4) * 1.2,
    delay: (i % 7) * 0.4, opacity: 0.05 + (i % 3) * 0.04,
  }))

  return (
    <div className="relative flex flex-col items-center justify-center flex-1 gap-5 px-8 overflow-hidden">
      <style>{`
        @keyframes prl-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes prl-particle { 0%,100%{transform:translateY(0) scale(1);opacity:var(--p-op)} 50%{transform:translateY(-16px) scale(1.2);opacity:calc(var(--p-op)*1.8)} }
        @keyframes prl-fade-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes prl-glow { 0%,100%{box-shadow:0 0 16px rgba(96,165,250,0.05)} 50%{box-shadow:0 0 24px rgba(96,165,250,0.14)} }
        @keyframes prl-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes prl-pulse { 0%,100%{opacity:0.3} 50%{opacity:0.7} }
        @keyframes prl-shimmer { 0%{opacity:0.4} 50%{opacity:0.8} 100%{opacity:0.4} }
      `}</style>

      {particles.map((p) => (
        <div key={p.id} className="absolute rounded-full pointer-events-none" style={{
          left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size,
          backgroundColor: p.id % 3 === 0 ? "rgb(96,165,250)" : p.id % 3 === 1 ? "rgb(167,139,250)" : "rgb(52,211,153)",
          ["--p-op" as string]: p.opacity, opacity: p.opacity,
          animation: `prl-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
        }} />
      ))}

      <div className="relative z-10" style={{ animation: "prl-float 3.5s ease-in-out infinite" }}>
        <div className="w-16 h-16 rounded-2xl bg-card border border-blue-400/15 flex items-center justify-center relative overflow-hidden" style={{ animation: "prl-glow 2.5s ease-in-out infinite" }}>
          <svg width="28" height="28" viewBox="0 0 28 28" className="text-blue-400/70" style={{ animation: "prl-spin 2s linear infinite" }}>
            <circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 42" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="text-center z-10" style={{ animation: "prl-fade-up 0.5s ease-out 0.1s both" }}>
        <p className="text-sm font-medium text-foreground/70" style={{ animation: "prl-shimmer 2s ease-in-out infinite" }}>
          {pr.title}
        </p>
        <p className="text-[11px] text-muted-foreground/40 mt-1 font-mono">{pr.branch || pr.repo}</p>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/40 font-mono z-10" style={{ animation: "prl-fade-up 0.5s ease-out 0.3s both" }}>
        <span style={{ animation: "prl-pulse 1.4s ease-in-out infinite" }}>◌</span>
        <span>Loading…</span>
      </div>
    </div>
  )
}

// ── Inline reviewing indicator (shown during re-runs when messages already exist) ──

function ReviewingInlineView({ currentStep }: { currentStep: number }) {
  const step = REVIEW_STEPS[Math.min(currentStep, REVIEW_STEPS.length - 1)]
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-6 h-6 rounded-md bg-muted border border-blue-400/30 flex items-center justify-center shrink-0 mt-0.5" style={{ animation: "rv-glow 2.5s ease-in-out infinite" }}>
        <style>{`@keyframes rv-spin-sm{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-blue-400" style={{ animation: "rv-spin-sm 1s linear infinite" }}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 15" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-blue-400/80">{step?.icon}</span>
          <span className="text-[12px] text-muted-foreground/60 font-mono">{step?.label ?? "Reviewing…"}</span>
          <span className="text-[10px] text-muted-foreground/30 font-mono">
            {currentStep + 1}/{REVIEW_STEPS.length}
          </span>
        </div>
        <div className="mt-2 h-0.5 w-full max-w-[180px] bg-secondary/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500/70 to-violet-500/70 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.round(((currentStep + 0.5) / REVIEW_STEPS.length) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Verdict bar (submit review to GitHub) ────────────────────────────────────

function VerdictBar({
  verdict: aiVerdict,
  comments,
  summary,
  pr,
  onSubmitted,
  onReviewSubmitted,
}: {
  verdict: ChatMessage["verdict"]
  comments: ReviewComment[]
  summary: string
  pr: PullRequest
  onSubmitted: (sentIds: string[]) => void
  onReviewSubmitted: (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string, commentCount: number) => void
}) {
  const [submitting, setSubmitting] = useState<string | null>(null) // which verdict button
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingComments = comments.filter((c) => c.status === "pending" || c.status === "queued")

  async function handleSubmit(event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT") {
    if (!pr.repoId || submitting || submitted) return
    setSubmitting(event)
    setError(null)
    try {
      const inlineComments = pendingComments
        .filter((c) => c.type === "inline" && c.path && c.line)
        .map((c) => ({ path: c.path!, line: c.line!, body: c.body }))
      await api.submitPRReview(pr.repoId, pr.number, { event, body: summary, comments: inlineComments })
      setSubmitted(true)
      onSubmitted(pendingComments.map((c) => c.id))
      onReviewSubmitted(event, summary, inlineComments.length)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  const aiLabel = aiVerdict === "approve" ? "Approve"
    : aiVerdict === "request_changes" ? "Request changes"
    : "Comment"

  if (submitted) {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-400">
        <IconCheck size={12} /> Review submitted to GitHub
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {aiVerdict && (
        <div className="text-[11px] text-muted-foreground/50">
          AI suggests: <span className="text-muted-foreground">{aiLabel}</span>
          {pendingComments.length > 0 && <span> · {pendingComments.length} comment{pendingComments.length !== 1 ? "s" : ""} pending</span>}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleSubmit("APPROVE")}
          disabled={!!submitting}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5 disabled:opacity-50 hover:bg-emerald-400/15 transition-colors"
        >
          {submitting === "APPROVE" ? <IconLoader2 size={11} className="animate-spin" /> : <IconCheck size={11} />}
          Approve
        </button>
        <button
          onClick={() => handleSubmit("REQUEST_CHANGES")}
          disabled={!!submitting}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-0.5 disabled:opacity-50 hover:bg-amber-400/15 transition-colors"
        >
          {submitting === "REQUEST_CHANGES" ? <IconLoader2 size={11} className="animate-spin" /> : <IconAlertCircle size={11} />}
          Request changes
        </button>
        <button
          onClick={() => handleSubmit("COMMENT")}
          disabled={!!submitting}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground bg-secondary border border-border rounded-full px-2.5 py-0.5 disabled:opacity-50 hover:bg-accent transition-colors"
        >
          {submitting === "COMMENT" ? <IconLoader2 size={11} className="animate-spin" /> : <IconMessageCircle size={11} />}
          Comment only
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

// ── Chat message ──────────────────────────────────────────────────────────────

function Message({
  message,
  pr,
  onDismiss,
  onSend,
  onMarkSent,
  onRevert,
  onResolve,
  onUserReviewed,
  onReviewSubmitted,
}: {
  message: ChatMessage
  pr: PullRequest
  onDismiss: (id: string) => void
  onSend: (id: string) => void
  onMarkSent: (id: string) => void
  onRevert: (id: string) => void
  onResolve: (id: string) => void
  onUserReviewed?: () => void
  onReviewSubmitted?: (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string, commentCount: number) => void
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
        {!message.isReview && <MarkdownContent content={message.content} />}

        {message.isReview && message.verdict && (
          <VerdictBar
            verdict={message.verdict}
            comments={message.comments ?? []}
            summary={message.content}
            pr={pr}
            onSubmitted={(ids) => { ids.forEach((id) => onMarkSent(id)); onUserReviewed?.() }}
            onReviewSubmitted={(event, body, commentCount) => onReviewSubmitted?.(event, body, commentCount)}
          />
        )}

        {message.isReview && message.comments && message.comments.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                {message.comments.length} comment{message.comments.length !== 1 ? "s" : ""}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {message.comments.map((c) => (
              <ReviewCommentCard
                key={c.id}
                comment={c}
                onDismiss={onDismiss}
                onSend={async (id) => {
                  const comment = message.comments?.find((x) => x.id === id)
                  if (comment?.type === "general" && pr.repoId) {
                    await api.sendSingleComment(pr.repoId, pr.number, comment.body)
                    onMarkSent(id)
                  } else {
                    onSend(id)
                  }
                }}
                onRevert={onRevert}
                onResolve={onResolve}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Thread card (Comments tab) ────────────────────────────────────────────────

function extractDiffHunk(patch: string, targetLine: number | undefined): string | null {
  if (!targetLine) return null
  const lines = patch.split("\n")
  // Find the hunk header closest to targetLine
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
      if (dist < bestDistance) {
        bestDistance = dist
        bestHunkStart = i
      }
    }
  }
  if (bestHunkStart === -1) return null
  // Collect lines from hunk header up to 8 lines of context
  const hunkLines: string[] = []
  hunkLines.push(lines[bestHunkStart]) // @@ header
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
}: {
  thread: PRThread
  repoId: string
  prNumber: number
  fileDiffs: Record<string, string>
  currentUser?: string
  onReplied: (threadId: string, reply: PRThread["comments"][number]) => void
  onResolved: (threadId: string) => void
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
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[12px] font-medium text-foreground">{c.author}</span>
              <span className="text-[11px] text-muted-foreground/40">
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-[12.5px] text-foreground/80 leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>

      {/* Reply + resolve footer */}
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleReply()
                }
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

// ── Description accordion ─────────────────────────────────────────────────────

function PRDescriptionAccordion({ description }: { description: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
      >
        <IconChevronDown size={11} className={cn("transition-transform duration-150", open && "rotate-180")} />
        <span>{open ? "Hide" : "Show"} description</span>
      </button>
      {open && (
        <div className="mt-1.5 max-h-40 overflow-y-auto prose prose-sm prose-invert max-w-none [&>*]:text-[11px] [&>*]:text-muted-foreground/70 [&_p]:leading-relaxed [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_h1]:text-[12px] [&_h2]:text-[12px] [&_h3]:text-[11px] [&_h1,h2,h3]:font-semibold [&_h1,h2,h3]:text-foreground/70 [&_code]:text-[10px] [&_code]:bg-secondary [&_code]:px-1 [&_code]:rounded [&_a]:text-blue-400/70 [&_a]:underline">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

// ── Diff panel ────────────────────────────────────────────────────────────────

function PRDiffPanel({
  file,
  fileDiffs,
  onClose,
  threads,
  repoId,
  prNumber,
  currentUser,
  viewed,
  onToggleViewed,
  onThreadReplied,
  onThreadResolved,
  agentId,
}: {
  file: PRFile
  fileDiffs: Record<string, string>
  onClose: () => void
  threads: PRThread[]
  repoId?: string
  prNumber?: number
  currentUser?: string
  viewed: boolean
  onToggleViewed: () => void
  onThreadReplied: (threadId: string, reply: PRThread["comments"][number]) => void
  onThreadResolved: (threadId: string) => void
  agentId?: string
}) {
  // GitHub patches lack the `--- a/` / `+++ b/` headers that processFile needs to
  // detect the language for Shiki. Prepend them when the patch comes from GitHub.
  // trimPatchContext(raw, 3) trims each hunk to at most 3 context lines.
  const rawPatch = fileDiffs[file.path] ?? file.patch ?? ""
  const rawWithHeaders = rawPatch && !rawPatch.startsWith("diff --git") && !rawPatch.startsWith("---")
    ? `--- a/${file.path}\n+++ b/${file.path}\n${rawPatch}`
    : rawPatch
  const raw = rawWithHeaders ? trimPatchContext(rawWithHeaders, 3) : rawWithHeaders
  const fileName = file.path.split("/").pop() ?? file.path
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch full file content — via agent endpoints if agentId, else via GitHub API
  const { data: agentDiff } = useQuery({
    queryKey: ["diff", agentId, file.path],
    queryFn: () => api.getDiff(agentId!, file.path),
    staleTime: 30_000,
    enabled: !!agentId,
  })
  const { data: agentNewContent } = useQuery({
    queryKey: ["file-content", agentId, file.path],
    queryFn: () => api.getFileContent(agentId!, file.path),
    staleTime: 30_000,
    enabled: !!agentId && !!agentDiff,
  })
  const { data: agentOldContent } = useQuery({
    queryKey: ["file-base-content", agentId, file.path],
    queryFn: () => api.getBaseFileContent(agentId!, file.path),
    staleTime: 30_000,
    enabled: !!agentId && !!agentDiff,
  })
  const { data: ghNewContent } = useQuery({
    queryKey: ["pr-file-content", repoId, prNumber, file.path, "head"],
    queryFn: () => api.getPRFileContent(repoId!, prNumber!, file.path, "head"),
    staleTime: 60_000,
    enabled: !agentId && !!repoId && !!prNumber && !!raw,
  })
  const { data: ghOldContent } = useQuery({
    queryKey: ["pr-file-content", repoId, prNumber, file.path, "base"],
    queryFn: () => api.getPRFileContent(repoId!, prNumber!, file.path, "base"),
    staleTime: 60_000,
    enabled: !agentId && !!repoId && !!prNumber && !!raw,
  })

  const [expandedHunks, setExpandedHunks] = useState<Map<number, HunkExpansionRegion>>(new Map())

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

  const rawForDiff = agentId ? (agentDiff ?? raw) : raw
  const newContent = agentId ? agentNewContent : ghNewContent
  const oldContent = agentId ? agentOldContent : ghOldContent

  // Prevent scroll jump when expanding hunks (same fix as DiffView)
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    let savedScroll: number | null = null
    let clearTimer: ReturnType<typeof setTimeout> | null = null
    let inReset = false
    const onScroll = () => {
      if (savedScroll !== null && !inReset) {
        inReset = true
        container.scrollTop = savedScroll
        inReset = false
      }
    }
    const onClickCapture = () => {
      savedScroll = container.scrollTop
      if (clearTimer) clearTimeout(clearTimer)
      clearTimer = setTimeout(() => { savedScroll = null; clearTimer = null }, 600)
    }
    container.addEventListener("click", onClickCapture, true)
    container.addEventListener("scroll", onScroll)
    return () => {
      container.removeEventListener("click", onClickCapture, true)
      container.removeEventListener("scroll", onScroll)
      if (clearTimer) clearTimeout(clearTimer)
    }
  }, [])

  const fileDiff = rawForDiff && oldContent !== undefined && newContent !== undefined
    ? processFile(rawForDiff, {
        oldFile: { name: fileName, contents: oldContent },
        newFile: { name: fileName, contents: newContent },
      })
    : rawForDiff
      ? processFile(rawForDiff)
      : null
  const fileThreads = threads.filter((t) => t.path === file.path && !t.isResolved && t.comments.length > 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0 text-[11px]">
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors mr-1">
          <IconArrowLeft size={13} />
        </button>
        <span className="font-mono text-muted-foreground truncate flex-1">
          {file.path.replace(`/${fileName}`, "")}/<span className="text-foreground font-semibold">{fileName}</span>
        </span>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-emerald-400 font-mono">+{file.additions}</span>
          <span className="text-red-400 font-mono">-{file.deletions}</span>
          <button
            onClick={() => setDiffStyle((s) => s === "unified" ? "split" : "unified")}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title={diffStyle === "unified" ? "Switch to split view" : "Switch to unified view"}
          >
            {diffStyle === "unified" ? <IconLayoutColumns size={13} /> : <IconLayoutRows size={13} />}
          </button>
          <button
            onClick={onToggleViewed}
            className={cn("flex items-center gap-1.5 transition-colors", viewed ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <IconEye size={13} />
            <span>Viewed</span>
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        {fileDiff ? (
          <FileDiff
            fileDiff={fileDiff}
            options={{
              theme: "vesper",
              diffStyle,
              lineDiffType: "word",
              diffIndicators: "bars",
              disableFileHeader: true,
              hunkSeparators: "line-info",
              expandedHunks,
              onHunkExpand,
            }}
          />
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground/30 text-[12px]">
            {file.status === "added" ? "New file" : file.status === "deleted" ? "File deleted" : "Binary or large file — diff not available"}
          </div>
        )}
      </div>

      {/* Inline comment threads for this file */}
      {fileThreads.length > 0 && (
        <div className="border-t border-border shrink-0 max-h-72 overflow-y-auto">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50">
            <IconMessageCircle2 size={12} className="text-muted-foreground/50" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {fileThreads.length} comment{fileThreads.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="p-3 space-y-3">
            {fileThreads.map((t) => (
              <ThreadCard
                key={t.id}
                thread={t}
                repoId={repoId ?? ""}
                prNumber={prNumber ?? 0}
                fileDiffs={fileDiffs}
                currentUser={currentUser}
                onReplied={onThreadReplied}
                onResolved={onThreadResolved}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Changed files panel ───────────────────────────────────────────────────────

function PRFilesPanel({ files, loading, viewedFiles, onFileSelect }: { files: PRFile[]; loading?: boolean; viewedFiles: Set<string>; onFileSelect: (f: PRFile) => void }) {
  const viewedCount = files.filter((f) => viewedFiles.has(f.path)).length
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Changed files</span>
          <span className="text-[11px] font-mono text-muted-foreground/40">
            {viewedCount > 0 ? `${viewedCount}/` : ""}{files.length}
          </span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {loading && files.length === 0 && (
            <div className="flex items-center justify-center py-6 gap-1.5 text-muted-foreground/30">
              <IconLoader2 size={12} className="animate-spin" />
              <span className="text-[11px]">Loading files…</span>
            </div>
          )}
          {files.map((file) => {
            const isViewed = viewedFiles.has(file.path)
            return (
              <div key={file.path} onClick={() => onFileSelect(file)} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors cursor-pointer group">
                {isViewed
                  ? <IconCheck size={11} className="text-muted-foreground/50 shrink-0" />
                  : <IconFileCode size={11} className="text-muted-foreground/30 shrink-0" />
                }
                <span className={cn("text-[11px] font-mono flex-1 min-w-0 truncate", isViewed ? "text-muted-foreground/40" : "text-muted-foreground")}>
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
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── PR info panel ─────────────────────────────────────────────────────────────

function PRInfoPanel({ pr, files, branch, baseBranch, description }: { pr: PullRequest; files: PRFile[]; branch: string; baseBranch: string; description: string }) {
  const additions = files.length > 0 ? files.reduce((s, f) => s + f.additions, 0) : pr.additions
  const deletions = files.length > 0 ? files.reduce((s, f) => s + f.deletions, 0) : pr.deletions
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">PR info</span>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto">
        <div>
          <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Branch</div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground flex-wrap">
            <span className="text-foreground/80">{branch}</span>
            <span className="text-muted-foreground/30">→</span>
            <span>{baseBranch}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Author</div>
          <span className="text-[11px] text-muted-foreground">{pr.author}</span>
        </div>
        <div>
          <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Changes</div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-emerald-400">+{additions}</span>
            <span className="text-red-400">-{deletions}</span>
          </div>
        </div>
        {description && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wide mb-1">Description</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed prose-sm">
              <MarkdownContent content={description} />
            </div>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-[11px]"
          disabled={!pr.url}
          onClick={() => {
            if (!pr.url) return
            if (isTauri) {
              invoke("open_url", { url: pr.url })
            } else {
              window.open(pr.url, "_blank")
            }
          }}
        >
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
  onReviewDone?: () => void
  onUserReviewed?: () => void
}

export function PRView({ pr, onReviewDone, onUserReviewed }: PRViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [model, setModel] = useState("claude-sonnet-4-6")
  const [thinking, setThinking] = useState(false)
  const [activeTab, setActiveTab] = useState<"chat" | "comments" | "file">("chat")
  const [openFileTab, setOpenFileTab] = useState<PRFile | null>(null)
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({})
  const [prFiles, setPrFiles] = useState<PRFile[]>(pr.files)
  const [branch, setBranch] = useState(pr.branch)
  const [baseBranch, setBaseBranch] = useState(pr.baseBranch)
  const [description, setDescription] = useState(pr.description)
  const [threads, setThreads] = useState<PRThread[]>([])
  const [currentUser, setCurrentUser] = useState<string | undefined>()

  const viewedKey = pr.repoId ? `huxflux:pr-viewed:${pr.repoId}:${pr.number}` : null
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(() => {
    if (!pr.repoId) return new Set()
    try {
      const raw = localStorage.getItem(`huxflux:pr-viewed:${pr.repoId}:${pr.number}`)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })

  const toggleViewed = useCallback((path: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      if (viewedKey) localStorage.setItem(viewedKey, JSON.stringify(Array.from(next)))
      return next
    })
  }, [viewedKey])

  const [reviewStep, setReviewStep] = useState(0)
  const [loadingFiles, setLoadingFiles] = useState(!!pr.repoId)
  const [loadingDetails, setLoadingDetails] = useState(!!pr.repoId)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initRef = useRef(false)

  const reviewCacheKey = pr.repoId ? `huxflux:review:${pr.repoId}:${pr.number}` : null

  function loadCachedReviews(): ChatMessage[] {
    if (!reviewCacheKey) return []
    try {
      const raw = localStorage.getItem(reviewCacheKey)
      if (!raw) return []
      const data = JSON.parse(raw) as { reviews?: Array<{ content: string; verdict: ChatMessage["verdict"]; comments: ReviewComment[]; timestamp: string }> }
      if (!data.reviews || !Array.isArray(data.reviews)) {
        // Legacy single-review format
        const legacy = data as unknown as { content: string; verdict: ChatMessage["verdict"]; comments: ReviewComment[]; timestamp: string }
        if (legacy.content) {
          return [{
            id: `review-cached-${pr.number}-0`,
            role: "assistant",
            content: legacy.content,
            isReview: true,
            verdict: legacy.verdict,
            comments: legacy.comments,
            timestamp: legacy.timestamp,
          }]
        }
        return []
      }
      return data.reviews.map((r, i) => ({
        id: `review-cached-${pr.number}-${i}`,
        role: "assistant" as const,
        content: r.content,
        isReview: true,
        verdict: r.verdict,
        comments: r.comments,
        timestamp: r.timestamp,
      }))
    } catch { return [] }
  }

  function saveReviewCache(msg: ChatMessage) {
    if (!reviewCacheKey) return
    try {
      const raw = localStorage.getItem(reviewCacheKey)
      let existing: Array<{ content: string; verdict: ChatMessage["verdict"]; comments: ReviewComment[]; timestamp: string }> = []
      if (raw) {
        try {
          const data = JSON.parse(raw) as { reviews?: typeof existing }
          if (data.reviews && Array.isArray(data.reviews)) {
            existing = data.reviews
          }
        } catch { /* start fresh */ }
      }
      existing.push({
        content: msg.content,
        verdict: msg.verdict,
        comments: msg.comments ?? [],
        timestamp: msg.timestamp,
      })
      localStorage.setItem(reviewCacheKey, JSON.stringify({ reviews: existing }))
    } catch { /* storage full or unavailable */ }
  }

  function clearReviewCache() {
    if (reviewCacheKey) localStorage.removeItem(reviewCacheKey)
  }

  // Fetch real file diffs and PR details for real PRs (repoId set)
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
    }).catch(() => {}).finally(() => setLoadingFiles(false))

    api.getPRDetailsForRepo(pr.repoId, pr.number).then((details) => {
      if (details.branch) setBranch(details.branch)
      if (details.baseBranch) setBaseBranch(details.baseBranch)
      if (details.body) setDescription(details.body)
      if (details.currentUser) setCurrentUser(details.currentUser)
      if (details.reviewingCurrentStep != null) setReviewStep(details.reviewingCurrentStep)
      setThreads(details.threads.filter((t) => !t.isResolved && t.comments.length > 0))

      // For real PRs: auto-trigger only after details load so we know if a review is already active
      if (!initRef.current) {
        initRef.current = true
        const cached = loadCachedReviews()
        if (cached.length > 0) {
          setMessages(cached)
          setHasReviewed(true)
        } else if (details.reviewingStartedAt) {
          // Review already running on server — show animation and poll until it finishes
          setReviewing(true)
          pollForReviewCompletion()
        } else if (!pr.unread) {
          triggerReview()
        }
      }
    }).catch(() => {}).finally(() => setLoadingDetails(false))
  }, [pr.repoId, pr.number])

  useEffect(() => {
    if (pr.repoId) return  // handled after details load above
    if (initRef.current) return
    initRef.current = true
    const cached = loadCachedReviews()
    if (cached.length > 0) {
      setMessages(cached)
      setHasReviewed(true)
    } else if (!pr.unread) {
      triggerReview()
    }
  }, [])

  async function pollForReviewCompletion() {
    const interval = setInterval(async () => {
      if (!pr.repoId) { clearInterval(interval); return }
      try {
        const details = await api.getPRDetailsForRepo(pr.repoId, pr.number)
        if (details.reviewingCurrentStep != null) {
          setReviewStep(details.reviewingCurrentStep)
        }
        if (!details.reviewingStartedAt) {
          // Server review finished — reload cache (another tab may have populated it)
          clearInterval(interval)
          const cached = loadCachedReviews()
          if (cached.length > 0) {
            setMessages(cached)
            setHasReviewed(true)
          }
          setReviewing(false)
        }
      } catch {
        clearInterval(interval)
        setReviewing(false)
      }
    }, 3000)
  }

  async function triggerReview() {
    if (!pr.repoId) {
      // Mock fallback for non-GitHub PRs
      setReviewing(true)
      setTimeout(() => {
        const result = mockReviewResults[pr.id] ?? Object.values(mockReviewResults)[0]
        const msg: ChatMessage = {
          id: `review-${Date.now()}`,
          role: "assistant",
          content: result.summary,
          isReview: true,
          comments: result.comments.map((c) => ({ ...c })),
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, msg])
        setReviewing(false)
        setHasReviewed(true)
      }, 2200)
      return
    }

    setReviewing(true)
    const msgId = `review-${Date.now()}`
    const streamMsg: ChatMessage = {
      id: msgId,
      role: "assistant",
      content: "",
      isReview: false,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, streamMsg])

    try {
      const response = await api.streamPRReview(pr.repoId, pr.number)
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as { error?: string; debug?: string[] }
        if (errBody.error === "not_configured") {
          const hint = errBody.debug?.length
            ? `\n\nChecked:\n${errBody.debug.join("\n")}`
            : ""
          throw new Error(`not_configured${hint}`)
        }
        throw new Error(errBody.error ?? `Server error ${response.status}`)
      }
      if (!response.body) throw new Error("No response body")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let done = false
      let accumulatedContent = ""

      while (!done) {
        const chunk = await reader.read()
        if (chunk.done) break
        buf += decoder.decode(chunk.value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (line.startsWith(":")) continue  // SSE comment/heartbeat
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6)
          if (data === "[DONE]") { done = true; break }
          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string; step?: number }
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.step != null) setReviewStep((prev) => Math.max(prev, parsed.step!))
            if (parsed.text) {
              accumulatedContent += parsed.text
              setMessages((prev) =>
                prev.map((m) => (m.id === msgId ? { ...m, content: m.content + parsed.text } : m))
              )
            }
          } catch (parseErr) {
            const msg = (parseErr as Error).message
            if (!msg.startsWith("Unexpected") && !msg.startsWith("JSON")) throw parseErr
          }
        }
      }

      // Try to extract structured review JSON from the accumulated text
      const reviewData = parseReviewJson(accumulatedContent)
      if (reviewData) {
        const summaryText = accumulatedContent.replace(/```json[\s\S]+?```\s*$/m, "").trim()
        const comments: ReviewComment[] = (reviewData.comments as any[]).map((c, i) => ({
          id: `ai-${i}`,
          type: (c.type === "inline" && c.path) ? "inline" : "general" as const,
          severity: (["blocking", "suggestion", "nit"].includes(c.severity) ? c.severity : "suggestion") as ReviewComment["severity"],
          path: c.path,
          line: c.line,
          codeContext: c.path && c.line ? buildCodeContext(fileDiffs[c.path] ?? "", c.line) : undefined,
          body: c.body ?? "",
          status: "pending" as const,
        }))
        const reviewMsg: Partial<ChatMessage> = {
          content: reviewData.summary || summaryText,
          isReview: true,
          verdict: (["approve", "request_changes", "comment"].includes(reviewData.verdict)
            ? reviewData.verdict : "comment") as ChatMessage["verdict"],
          comments,
        }
        setMessages((prev) =>
          prev.map((m) => m.id === msgId ? { ...m, ...reviewMsg } : m)
        )
        // Persist to localStorage so we don't re-run on next open
        saveReviewCache({
          id: msgId,
          role: "assistant",
          timestamp: new Date().toISOString(),
          ...reviewMsg,
        } as ChatMessage)
        const reviewDesc = reviewMsg.verdict === "approve" ? "AI suggests: Approve" : reviewMsg.verdict === "request_changes" ? "AI suggests: Request changes" : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`
        toast.success(`Review ready: ${pr.title}`, { description: reviewDesc })
        if (getSoundEnabled()) playSound(getSoundPref())
        if (getDesktopNotif() && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`Review ready: ${pr.title}`, { body: reviewDesc })
        }
        onReviewDone?.()
      }
    } catch (err) {
      const errMsg = (err as Error).message
      const fallback = errMsg.startsWith("not_configured")
        ? `This repo isn't configured locally in Huxflux. Add it in Settings to enable AI review.${errMsg.includes("\n") ? "\n\n" + errMsg.slice(errMsg.indexOf("\n") + 1) : ""}`
        : `Review failed: ${errMsg}`
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: m.content || fallback } : m
        )
      )
    } finally {
      setReviewing(false)
      setHasReviewed(true)
    }
  }

  function handleReview() {
    if (reviewing || isSending) return
    triggerReview()
  }

  function handleRerun() {
    if (reviewing || isSending) return
    clearReviewCache()
    setMessages([])
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
    setActiveTab(threads.length > 0 ? "comments" : "chat")
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

  function toggleCommentResolved(commentId: string) {
    setMessages((prev) => prev.map((m) => ({
      ...m,
      comments: m.comments?.map((c) =>
        c.id === commentId ? { ...c, resolved: !c.resolved } : c
      ),
    })))
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
  const pendingCount = messages.flatMap((m) => m.comments ?? []).filter((c) => c.status === "pending" || c.status === "queued").length
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
                    <span className="text-[11px] font-mono text-muted-foreground/50">#{pr.number}</span>
                    <span className="text-[13px] font-semibold text-foreground truncate">{pr.title}</span>
                    {pr.reviewStatus === "changes-requested" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium shrink-0">
                        Changes requested
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground/60 flex-wrap">
                    <span>{pr.author}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="font-mono">{branch}</span>
                    <span className="text-muted-foreground/50">→</span>
                    <span className="font-mono">{baseBranch}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{pr.requestedAt}</span>
                    {(pr.additions > 0 || pr.deletions > 0) && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-emerald-400/80 font-mono">+{pr.additions}</span>
                        <span className="text-red-400/80 font-mono">-{pr.deletions}</span>
                      </>
                    )}
                    {hasReviewed && pendingCount > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-amber-400">{pendingCount} pending</span>
                        {sentCount > 0 && <span className="text-emerald-400">, {sentCount} sent</span>}
                      </>
                    )}
                  </div>
                  {description && (
                    <PRDescriptionAccordion description={description} />
                  )}
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
              <div
                onClick={() => setActiveTab("comments")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px cursor-pointer",
                  activeTab === "comments"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {loadingDetails ? (
                  <IconLoader2 size={12} className="shrink-0 animate-spin" />
                ) : (
                  <IconMessageCircle2 size={12} className="shrink-0" />
                )}
                Comments
                {threads.length > 0 && (
                  <span className="ml-0.5 text-[10px] font-mono bg-secondary px-1 py-0.5 rounded text-muted-foreground">
                    {threads.length}
                  </span>
                )}
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
                  {loadingFiles ? (
                    <IconLoader2 size={12} className="animate-spin" />
                  ) : (
                    <IconFileCode size={12} />
                  )}
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
                <PRDiffPanel
                  file={openFileTab}
                  fileDiffs={fileDiffs}
                  onClose={closeFileTab}
                  threads={threads}
                  repoId={pr.repoId}
                  prNumber={pr.number}
                  currentUser={currentUser}
                  agentId={pr.agentId}
                  viewed={viewedFiles.has(openFileTab.path)}
                  onToggleViewed={() => toggleViewed(openFileTab.path)}
                  onThreadReplied={(threadId, reply) =>
                    setThreads((prev) => prev.map((th) =>
                      th.id === threadId ? { ...th, comments: [...th.comments, reply] } : th
                    ))
                  }
                  onThreadResolved={(threadId) =>
                    setThreads((prev) => prev.filter((th) => th.id !== threadId))
                  }
                />
              </div>
            )}

            {/* Comments tab content */}
            {activeTab === "comments" && (
              <ScrollArea className="flex-1 min-h-0">
                {loadingDetails ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground/40">
                    <IconLoader2 size={14} className="animate-spin" />
                    <span className="text-[12px]">Loading comments…</span>
                  </div>
                ) : threads.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground/30">
                    <IconMessageCircle2 size={20} />
                    <span className="text-[12px]">No open review threads</span>
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    {threads.map((t) => (
                      <ThreadCard
                        key={t.id}
                        thread={t}
                        repoId={pr.repoId}
                        prNumber={pr.number}
                        fileDiffs={fileDiffs}
                        currentUser={currentUser}
                        onReplied={(threadId, reply) =>
                          setThreads((prev) => prev.map((th) =>
                            th.id === threadId
                              ? { ...th, comments: [...th.comments, reply] }
                              : th
                          ))
                        }
                        onResolved={(threadId) =>
                          setThreads((prev) => prev.filter((th) => th.id !== threadId))
                        }
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
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

            {/* Loading / empty state */}
            {messages.length === 0 && !reviewing && !pr.unread && (
              loadingDetails
                ? <PRLoadingView pr={pr} />
                : null
            )}

            {/* Reviewing animation — full panel for first review, inline for re-runs */}
            {reviewing && messages.every((m) => !m.content) && (
              <ReviewingView pr={pr} currentStep={reviewStep} />
            )}

            {/* Messages */}
            {!(reviewing && messages.every((m) => !m.content)) && (messages.length > 0 || isSending) && (
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <div className="py-3">
                  {messages.map((msg) => (
                    <Message
                      key={msg.id}
                      message={msg}
                      pr={pr}
                      onDismiss={(id) => updateCommentStatus(id, "dismissed")}
                      onSend={(id) => updateCommentStatus(id, "queued")}
                      onMarkSent={(id) => updateCommentStatus(id, "sent")}
                      onRevert={(id) => updateCommentStatus(id, "pending")}
                      onResolve={(id) => toggleCommentResolved(id)}
                      onUserReviewed={onUserReviewed}
                      onReviewSubmitted={(event, _body, commentCount) => {
                        const label = event === "APPROVE" ? "Approved" : event === "REQUEST_CHANGES" ? "Requested changes" : "Commented"
                        const detail = commentCount > 0 ? ` with ${commentCount} inline comment${commentCount !== 1 ? "s" : ""}` : ""
                        setMessages((prev) => [...prev, {
                          id: `submitted-${Date.now()}`,
                          role: "user" as const,
                          content: `${label}${detail}`,
                          timestamp: new Date().toISOString(),
                        }])
                      }}
                    />
                  ))}
                  {reviewing && !messages.every((m) => !m.content) && messages[messages.length - 1]?.content === "" && (
                    <ReviewingInlineView currentStep={reviewStep} />
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
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
                      onClick={hasReviewed ? handleRerun : handleReview}
                      disabled={reviewing}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
                        reviewing ? "opacity-40 cursor-not-allowed" : "hover:bg-accent text-muted-foreground/60"
                      )}
                    >
                      {hasReviewed ? <IconRefresh size={13} /> : <IconEye size={13} />}
                      <span>{hasReviewed ? "Re-run" : "Review"}</span>
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
              <PRFilesPanel files={prFiles} loading={loadingFiles} viewedFiles={viewedFiles} onFileSelect={openFile} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={40} minSize={20}>
              <PRInfoPanel pr={pr} files={prFiles} branch={branch} baseBranch={baseBranch} description={description} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  )
}
