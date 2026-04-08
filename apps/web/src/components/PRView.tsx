import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { isTauri } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ScrollArea } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { cn } from "@huxflux/ui"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import { Popover, PopoverTrigger, PopoverContent } from "@huxflux/ui"
import type { PullRequest, ReviewComment, PRFile } from "@/data/mockReviews"
import { mockReviewResults } from "@/data/mockReviews"
import { api } from "@huxflux/shared"
import { toast } from "sonner"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref, getDesktopNotif } from "@/lib/notificationPrefs"
import type { PRThread, PRIssueComment, PRChatMessage } from "@huxflux/shared"
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
  IconX,
  IconLoader2,
  IconMessageCircle2,
  IconLayoutColumns,
  IconLayoutRows,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconGitBranch,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconAlertTriangle,
  IconFolder,
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

interface PendingReviewComment {
  id: string
  path: string
  line: number
  body: string
  source: "agentic" | "inline"
  codeContext?: ReviewComment["codeContext"]
  filePath?: string
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
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{children}</a>,
      }}
    >
      {cleaned}
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
  onAddToChat,
  onQueue,
  onDequeue,
  isQueued,
}: {
  comment: ReviewComment
  onDismiss: (id: string) => void
  onAddToChat: (id: string) => void
  onQueue: (id: string) => void
  onDequeue: (id: string) => void
  isQueued: boolean
}) {
  const cfg = severityConfig[comment.severity]
  const Icon = cfg.icon
  const isDismissed = comment.status === "dismissed"
  const isSent = comment.status === "sent"

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden transition-opacity",
      cfg.border,
      (isDismissed || isSent) && "opacity-50"
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

        {isSent && (
          <div className="flex items-center gap-1 text-[11px] text-emerald-400/70">
            <IconCheck size={11} />
            Submitted
          </div>
        )}
        {!isDismissed && !isSent && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onDismiss(comment.id)}
              className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => onAddToChat(comment.id)}
              className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              Add to chat
            </button>
            {isQueued ? (
              <button
                onClick={() => onDequeue(comment.id)}
                className="ml-auto flex items-center gap-1 text-[11px] text-blue-400 hover:text-red-400 transition-colors"
              >
                <IconCheck size={11} />
                Remove from review
              </button>
            ) : (
              <button
                onClick={() => onQueue(comment.id)}
                className="ml-auto text-[11px] font-medium text-muted-foreground/60 hover:text-foreground border border-border hover:border-foreground/30 rounded px-2 py-0.5 transition-colors"
              >
                Queue for review
              </button>
            )}
          </div>
        )}
        {isDismissed && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/30">Dismissed</span>
            <button
              onClick={() => onDismiss(comment.id)} // revert by calling dismiss again (toggle)
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

const REVIEW_STEPS = [
  { label: "Fetching diff", icon: "⇣" },
  { label: "Building prompt", icon: "⊞" },
  { label: "Starting review", icon: "⊕" },
  { label: "Reviewing", icon: "◈" },
  { label: "Analyzing code", icon: "⧉" },
  { label: "Forming conclusions", icon: "⇄" },
]

function ReviewingView({ pr, currentStep }: { pr: PullRequest; currentStep: number }) {
  const visibleSteps = currentStep + 1
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
        <p className="text-sm font-medium text-foreground/70" style={{ animation: "prl-shimmer 2s ease-in-out infinite" }}>{pr.title}</p>
        <p className="text-[11px] text-muted-foreground/40 mt-1 font-mono">{pr.branch || pr.repo}</p>
      </div>
    </div>
  )
}

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
          <span className="text-[10px] text-muted-foreground/30 font-mono">{currentStep + 1}/{REVIEW_STEPS.length}</span>
        </div>
        <div className="mt-2 h-0.5 w-full max-w-[180px] bg-secondary/60 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500/70 to-violet-500/70 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.round(((currentStep + 0.5) / REVIEW_STEPS.length) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

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

// ── Inline-commentable diff view ─────────────────────────────────────────────

type ParsedDiffLine =
  | { kind: "hunk"; content: string }
  | { kind: "added" | "removed" | "context"; oldLine?: number; newLine?: number; content: string }
  | { kind: "gap"; from: number; to: number }

function parseDiffLines(patch: string): ParsedDiffLine[] {
  const result: ParsedDiffLine[] = []
  let old = 0, nw = 0
  let lastNewLine = 0
  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
    if (hunk) {
      const newStart = parseInt(hunk[2], 10)
      if (lastNewLine > 0 && newStart > lastNewLine + 1) {
        result.push({ kind: "gap", from: lastNewLine + 1, to: newStart - 1 })
      }
      old = parseInt(hunk[1], 10) - 1; nw = newStart - 1
      result.push({ kind: "hunk", content: line }); continue
    }
    if (line.startsWith("+")) { nw++; lastNewLine = nw; result.push({ kind: "added", newLine: nw, content: line.slice(1) }) }
    else if (line.startsWith("-")) { old++; result.push({ kind: "removed", oldLine: old, content: line.slice(1) }) }
    else if (line.startsWith(" ")) { old++; nw++; lastNewLine = nw; result.push({ kind: "context", oldLine: old, newLine: nw, content: line.slice(1) }) }
  }
  return result
}

function DiffWithInlineComments({
  patch,
  pendingComments,
  onAddComment,
  onRemoveComment,
  onEditComment,
  repoId,
  prNumber,
  filePath,
}: {
  patch: string
  pendingComments: PendingReviewComment[]
  onAddComment: (line: number, body: string) => void
  onRemoveComment: (id: string) => void
  onEditComment: (id: string, body: string) => void
  repoId?: string
  prNumber?: number
  filePath?: string
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [activeCommentIdx, setActiveCommentIdx] = useState<number | null>(null)
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [fileContent, setFileContent] = useState<string[] | null>(null)
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set())
  const [loadingZone, setLoadingZone] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const rawLines = parseDiffLines(patch)

  async function expandZone(from: number, to: number) {
    const key = `gap-${from}-${to}`
    if (expandedZones.has(key)) { setExpandedZones(prev => { const n = new Set(prev); n.delete(key); return n }); return }
    let content = fileContent
    if (!content && repoId && prNumber != null && filePath) {
      setLoadingZone(key)
      try {
        const text = await api.getPRFileContent(repoId, prNumber, filePath, "head")
        content = text.split("\n")
        setFileContent(content)
      } catch { content = [] } finally { setLoadingZone(null) }
    }
    setExpandedZones(prev => { const n = new Set(prev); n.add(key); return n })
  }

  // Expand gap zones inline so the comment/hover logic works uniformly
  const lines: ParsedDiffLine[] = rawLines.flatMap((l) => {
    if (l.kind !== "gap") return [l]
    const key = `gap-${l.from}-${l.to}`
    if (!expandedZones.has(key) || !fileContent) return [l]
    return Array.from({ length: l.to - l.from + 1 }, (_, i): ParsedDiffLine => ({
      kind: "context",
      oldLine: l.from + i,
      newLine: l.from + i,
      content: fileContent[l.from + i - 1] ?? "",
    }))
  })

  function openForm(idx: number, line: number) {
    setActiveCommentIdx(idx)
    setActiveCommentLine(line)
    setCommentBody("")
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function openEdit(id: string, body: string) {
    setEditingId(id)
    setEditBody(body)
    setTimeout(() => editTextareaRef.current?.focus(), 50)
  }

  function submitEdit() {
    if (!editBody.trim() || editingId == null) return
    onEditComment(editingId, editBody.trim())
    setEditingId(null)
    setEditBody("")
  }

  function submit() {
    if (!commentBody.trim() || activeCommentLine == null) return
    onAddComment(activeCommentLine, commentBody.trim())
    setActiveCommentIdx(null)
    setActiveCommentLine(null)
    setCommentBody("")
  }

  return (
    <div className="overflow-x-auto text-[12px] font-mono bg-[#0d0d0d] rounded-b-lg">
      <table className="min-w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            if (line.kind === "hunk") {
              return (
                <tr key={idx} className="bg-blue-500/5">
                  <td colSpan={5} className="px-3 py-0.5 text-blue-400/60 text-[11px] select-none">{line.content}</td>
                </tr>
              )
            }
            if (line.kind === "gap") {
              const key = `gap-${line.from}-${line.to}`
              const count = line.to - line.from + 1
              const isLoading = loadingZone === key
              return (
                <tr key={key} className="bg-secondary/20">
                  <td colSpan={5} className="py-0.5 text-center border-y border-border/20">
                    <button
                      onClick={() => expandZone(line.from, line.to)}
                      disabled={isLoading}
                      className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1.5 mx-auto py-0.5"
                    >
                      {isLoading ? <IconLoader2 size={11} className="animate-spin" /> : <span>↕</span>}
                      {count} unchanged line{count !== 1 ? "s" : ""}
                    </button>
                  </td>
                </tr>
              )
            }
            const commentLine = line.kind !== "removed" ? line.newLine : line.oldLine
            const isHovered = hoveredIdx === idx
            const hasComment = commentLine != null && pendingComments.some((c) => c.line === commentLine)
            const showForm = activeCommentIdx === idx
            const rowBg = line.kind === "added" ? "bg-emerald-500/10" : line.kind === "removed" ? "bg-red-500/10" : ""
            const prefix = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "
            const prefixColor = line.kind === "added" ? "text-emerald-400" : line.kind === "removed" ? "text-red-400" : "text-muted-foreground/20"
            const textColor = line.kind === "added" ? "text-emerald-100/90" : line.kind === "removed" ? "text-red-200/80" : "text-foreground/70"

            return (
              <React.Fragment key={idx}>
                <tr
                  className={cn("group relative", rowBg, isHovered && commentLine != null && "brightness-110")}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {/* Old line number */}
                  <td className="select-none text-right pl-2 pr-1.5 py-0.5 w-9 text-[10px] text-muted-foreground/20 tabular-nums border-r border-border/20">
                    {line.kind !== "added" ? (line.oldLine ?? "") : ""}
                  </td>
                  {/* New line number */}
                  <td className="select-none text-right pl-1.5 pr-1.5 py-0.5 w-9 text-[10px] text-muted-foreground/20 tabular-nums border-r border-border/20">
                    {line.kind !== "removed" ? (line.newLine ?? "") : ""}
                  </td>
                  {/* Prefix */}
                  <td className={cn("select-none px-1 py-0.5 w-4 text-center font-bold", prefixColor)}>{prefix}</td>
                  {/* Content */}
                  <td className={cn("pl-1 pr-2 py-0.5 whitespace-pre", textColor)}>{line.content}</td>
                  {/* Add comment button — sticky so it stays visible when scrolling horizontally */}
                  <td className="sticky right-0 w-6 px-1 bg-inherit">
                    {commentLine != null && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (commentLine != null) openForm(idx, commentLine) }}
                        className={cn(
                          "w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center transition-colors select-none",
                          hasComment
                            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                            : isHovered
                            ? "bg-accent text-foreground/70 hover:text-foreground"
                            : "text-muted-foreground/25 hover:bg-accent hover:text-foreground/60"
                        )}
                        title="Add comment"
                      >
                        +
                      </button>
                    )}
                  </td>
                </tr>
                {/* Pending comments for this line */}
                {commentLine != null && pendingComments.filter((c) => c.line === commentLine).map((c) => (
                  <tr key={c.id} className="bg-blue-500/5 border-y border-blue-500/10" onMouseEnter={() => setHoveredIdx(null)}>
                    <td colSpan={5} className="px-3 py-2">
                      {editingId === c.id ? (
                        <div>
                          <textarea
                            ref={editTextareaRef}
                            value={editBody}
                            onChange={(e) => {
                              setEditBody(e.target.value)
                              e.target.style.height = "auto"
                              e.target.style.height = `${e.target.scrollHeight}px`
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitEdit() }}
                            rows={2}
                            className="w-full text-[12px] font-sans bg-secondary/60 border border-input rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:border-ring resize-none overflow-hidden"
                          />
                          <div className="flex items-center gap-2 mt-1.5">
                            <button
                              onClick={submitEdit}
                              disabled={!editBody.trim()}
                              className="text-[11px] font-medium px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-[11px] text-muted-foreground/50 hover:text-foreground px-1 py-1"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <span className="text-blue-400/60 text-[10px] mt-0.5 shrink-0">◆</span>
                          <span className="text-[12px] font-sans text-foreground/80 flex-1">{c.body}</span>
                          <button
                            onClick={() => openEdit(c.id, c.body)}
                            className="text-muted-foreground/30 hover:text-foreground transition-colors shrink-0 text-[10px]"
                            title="Edit comment"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onRemoveComment(c.id)}
                            className="text-muted-foreground/30 hover:text-red-400 transition-colors shrink-0"
                            title="Remove comment"
                          >
                            <IconX size={11} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {showForm && (
                  <tr className="bg-blue-500/5 border-y border-blue-500/20" onMouseEnter={() => setHoveredIdx(null)}>
                    <td colSpan={5} className="px-3 py-2">
                      <textarea
                        ref={textareaRef}
                        value={commentBody}
                        onChange={(e) => {
                          setCommentBody(e.target.value)
                          e.target.style.height = "auto"
                          e.target.style.height = `${e.target.scrollHeight}px`
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit() }}
                        placeholder={`Comment on line ${commentLine}…`}
                        rows={2}
                        className="w-full text-[12px] font-sans bg-secondary/60 border border-input rounded px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring resize-none overflow-hidden"
                      />
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={submit}
                          disabled={!commentBody.trim()}
                          className="text-[11px] font-medium px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-40"
                        >
                          Add comment
                        </button>
                        <button
                          onClick={() => { setActiveCommentIdx(null); setActiveCommentLine(null) }}
                          className="text-[11px] text-muted-foreground/50 hover:text-foreground px-1 py-1"
                        >
                          Cancel
                        </button>
                        <span className="text-[10px] text-muted-foreground/30 ml-auto">⌘↵ to submit</span>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
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
  agentId,
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
  onAddComment: (path: string, line: number, body: string) => void
  onRemoveComment: (id: string) => void
  onEditComment: (id: string, body: string) => void
  pendingComments: PendingReviewComment[]
  diffStyle: "unified" | "split"
}) {
  const fileName = file.path.split("/").pop() ?? file.path
  const fileThreads = threads.filter((t) => t.path === file.path && !t.isResolved && t.comments.length > 0)
  const filePendingComments = pendingComments.filter((c) => c.path === file.path)

  const rawPatch = fileDiffs[file.path] ?? file.patch ?? ""

  const statusColor = file.status === "added" ? "text-emerald-400"
    : file.status === "deleted" ? "text-red-400"
    : "text-muted-foreground/50"

  return (
    <div className="rounded-lg border border-border" id={`file-${file.path.replace(/\//g, "-")}`}>
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
              onAddComment={(line, body) => onAddComment(file.path, line, body)}
              onRemoveComment={onRemoveComment}
              onEditComment={onEditComment}
              repoId={repoId}
              prNumber={prNumber}
              filePath={file.path}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground/30 text-[12px]">
              {file.status === "added" ? "New file" : file.status === "deleted" ? "File deleted" : "Binary or large file — diff not available"}
            </div>
          )}

          {/* Inline comment threads for this file */}
          {fileThreads.length > 0 && (
            <div className="border-t border-border/50">
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
          .map((c) => ({ path: c.path, line: c.line, body: c.body })),
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

function ChatMessageBubble({
  message,
}: {
  message: ChatMessage
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
        {!message.isReview && (
          message.content
            ? <MarkdownContent content={message.content} />
            : <IconLoader2 size={14} className="animate-spin text-muted-foreground/40 mt-1" />
        )}
      </div>
    </div>
  )
}

// ── PR file tree (Changes tab right panel) ───────────────────────────────────

interface PRTreeEntry {
  name: string
  path: string
  type: "file" | "directory"
  children?: PRTreeEntry[]
  additions?: number
  deletions?: number
  viewed?: boolean
}

function buildPRFileTree(files: { path: string; additions: number; deletions: number }[], viewedFiles: Set<string>): PRTreeEntry[] {
  const root: PRTreeEntry[] = []
  for (const file of files) {
    const parts = file.path.split("/")
    let current = root
    let builtPath = ""
    for (let i = 0; i < parts.length; i++) {
      builtPath = builtPath ? `${builtPath}/${parts[i]}` : parts[i]
      const isFile = i === parts.length - 1
      let node = current.find((n) => n.name === parts[i])
      if (!node) {
        node = isFile
          ? { name: parts[i], path: file.path, type: "file", additions: file.additions, deletions: file.deletions, viewed: viewedFiles.has(file.path) }
          : { name: parts[i], path: builtPath, type: "directory", children: [] }
        current.push(node)
      }
      if (!isFile) current = node.children!
    }
  }
  return root
}

function PRFileTreeNode({
  entry,
  depth,
  onSelect,
}: {
  entry: PRTreeEntry
  depth: number
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(true)

  if (entry.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-1.5 py-[3px] text-left hover:bg-accent/40 transition-colors"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <IconChevronRight size={10} className={cn("text-muted-foreground/40 shrink-0 transition-transform", open && "rotate-90")} />
          <IconFolder size={12} className="text-muted-foreground/50 shrink-0" />
          <span className="text-[11px] text-muted-foreground truncate">{entry.name}</span>
        </button>
        {open && entry.children?.map((child) => (
          <PRFileTreeNode key={child.path} entry={child} depth={depth + 1} onSelect={onSelect} />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className={cn(
        "w-full flex items-center gap-1.5 py-[3px] text-left hover:bg-accent/40 transition-colors",
        entry.viewed && "opacity-50 hover:opacity-100"
      )}
      style={{ paddingLeft: `${20 + depth * 14}px` }}
    >
      {entry.viewed
        ? <IconCheck size={10} className="text-muted-foreground/40 shrink-0" />
        : <span className="text-[9px] text-muted-foreground/30 shrink-0 leading-none">◆</span>
      }
      <span className="text-[11px] font-mono text-foreground/80 truncate flex-1 min-w-0">{entry.name}</span>
      <div className="flex items-center gap-1 shrink-0 pr-1">
        {(entry.additions ?? 0) > 0 && <span className="text-[9px] font-mono text-emerald-400">+{entry.additions}</span>}
        {(entry.deletions ?? 0) > 0 && <span className="text-[9px] font-mono text-red-400">-{entry.deletions}</span>}
      </div>
    </button>
  )
}

// ── Main PRView ───────────────────────────────────────────────────────────────

interface PRViewProps {
  pr: PullRequest
  onReviewDone?: () => void
  onUserReviewed?: () => void
}

export function PRView({ pr, onReviewDone, onUserReviewed }: PRViewProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<"conversations" | "review" | "changes">("review")

  // Review/chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [model, setModel] = useState("claude-sonnet-4-6")
  const [thinking, setThinking] = useState(false)
  const [reviewStep, setReviewStep] = useState(0)
  const [attachedThreads, setAttachedThreads] = useState<PRThread[]>([])

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
  const [prDetails, setPrDetails] = useState<{ title: string; body?: string; author: string; avatarUrl?: string; createdAt: string; url: string } | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(!!pr.repoId)
  const [loadingDetails, setLoadingDetails] = useState(!!pr.repoId)

  // Changes tab state
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">(
    () => (localStorage.getItem("huxflux:pr-diff-style") as "unified" | "split") ?? "unified"
  )

  // Pending review comments (localStorage persisted)
  const pendingKey = pr.repoId ? `huxflux:pr-pending:${pr.repoId}:${pr.number}` : null
  const [pendingComments, setPendingComments] = useState<PendingReviewComment[]>(() => {
    if (!pendingKey) return []
    try {
      const raw = localStorage.getItem(pendingKey)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [showSubmitPopover, setShowSubmitPopover] = useState(false)

  // Viewed files (localStorage persisted)
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

  function savePendingComments(updater: PendingReviewComment[] | ((prev: PendingReviewComment[]) => PendingReviewComment[])) {
    setPendingComments((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater
      if (pendingKey) localStorage.setItem(pendingKey, JSON.stringify(next))
      return next
    })
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initRef = useRef(false)
  const isRerunRef = useRef(false)
  const fileDiffsRef = useRef<Record<string, string>>({})

  // ── Review cache (localStorage, backwards compat) ──────────────────────────
  const reviewCacheKey = pr.repoId ? `huxflux:review:${pr.repoId}:${pr.number}` : null

  function loadCachedReviews(): ChatMessage[] {
    if (!reviewCacheKey) return []
    try {
      const raw = localStorage.getItem(reviewCacheKey)
      if (!raw) return []
      const data = JSON.parse(raw) as { reviews?: Array<{ content: string; verdict: ChatMessage["verdict"]; comments: ReviewComment[]; timestamp: string }> }
      if (!data.reviews || !Array.isArray(data.reviews)) {
        const legacy = data as unknown as { content: string; verdict: ChatMessage["verdict"]; comments: ReviewComment[]; timestamp: string }
        if (legacy.content) {
          return [{ id: `review-cached-${pr.number}-0`, role: "assistant", content: legacy.content, isReview: true, verdict: legacy.verdict, comments: legacy.comments, timestamp: legacy.timestamp }]
        }
        return []
      }
      return data.reviews.map((r, i) => ({ id: `review-cached-${pr.number}-${i}`, role: "assistant" as const, content: r.content, isReview: true, verdict: r.verdict, comments: r.comments, timestamp: r.timestamp }))
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
          if (data.reviews && Array.isArray(data.reviews)) existing = data.reviews
        } catch { /* start fresh */ }
      }
      existing.push({ content: msg.content, verdict: msg.verdict, comments: msg.comments ?? [], timestamp: msg.timestamp })
      localStorage.setItem(reviewCacheKey, JSON.stringify({ reviews: existing }))
    } catch { /* storage full */ }
  }

  function clearReviewCache() {
    if (reviewCacheKey) localStorage.removeItem(reviewCacheKey)
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
      fileDiffsRef.current = map
      setFileDiffs(map)
      setPrFiles(fileList)
      // Expand unviewed files by default in changes tab
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
      if (details.reviewingCurrentStep != null) setReviewStep(details.reviewingCurrentStep)
      setThreads(details.threads.filter((t) => !t.isResolved && t.comments.length > 0))
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
      })

      if (!initRef.current) {
        initRef.current = true
        // Try DB first, then localStorage cache
        if (pr.repoId) {
          api.getPRChatMessages(pr.repoId!, pr.number).then((dbMsgs) => {
            if (dbMsgs.length > 0) {
              // Convert DB messages to ChatMessage format
              const converted = dbMsgs.map((m): ChatMessage => {
                if (m.isReview) {
                  const reviewData = parseReviewJson(m.content)
                  if (reviewData) {
                    const summaryText = m.content.replace(/```json[\s\S]+?```\s*$/m, "").trim()
                    const comments: ReviewComment[] = (reviewData.comments as any[]).map((c, i) => ({
                      id: `db-ai-${i}-${m.id}`,
                      type: (c.type === "inline" && c.path) ? "inline" : "general" as const,
                      severity: (["blocking", "suggestion", "nit"].includes(c.severity) ? c.severity : "suggestion") as ReviewComment["severity"],
                      path: c.path,
                      line: c.line,
                      codeContext: c.path && c.line ? buildCodeContext(fileDiffsRef.current[c.path] ?? fileDiffs[c.path] ?? "", c.line) : undefined,
                      body: c.body ?? "",
                      status: "pending" as const,
                    }))
                    return { id: m.id, role: "assistant", content: reviewData.summary || summaryText, isReview: true, verdict: (["approve", "request_changes", "comment"].includes(reviewData.verdict) ? reviewData.verdict : "comment") as ChatMessage["verdict"], comments, timestamp: m.createdAt }
                  }
                }
                return { id: m.id, role: m.role, content: m.content, isReview: m.isReview, timestamp: m.createdAt }
              })
              setMessages(converted)
              setHasReviewed(converted.some((m) => m.isReview))
            } else {
              // Fall back to localStorage cache
              const cached = loadCachedReviews()
              if (cached.length > 0) {
                setMessages(cached)
                setHasReviewed(true)
              } else if (details.reviewingStartedAt) {
                setReviewing(true)
                pollForReviewCompletion()
              } else if (!pr.unread) {
                triggerReview()
              }
            }
          }).catch(() => {
            const cached = loadCachedReviews()
            if (cached.length > 0) {
              setMessages(cached)
              setHasReviewed(true)
            } else if (!pr.unread) {
              triggerReview()
            }
          })
        }
      }
    }).catch(() => {}).finally(() => setLoadingDetails(false))
  }, [pr.repoId, pr.number])

  useEffect(() => {
    if (pr.repoId) return
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

  // Re-derive codeContext for all review comments when fileDiffs populates (race condition fix)
  useEffect(() => {
    if (Object.keys(fileDiffs).length === 0) return
    setMessages((prev) => prev.map((msg) => {
      if (!msg.isReview || !msg.comments) return msg
      return {
        ...msg,
        comments: msg.comments.map((c) => ({
          ...c,
          codeContext: c.path && c.line ? buildCodeContext(fileDiffs[c.path] ?? "", c.line) : c.codeContext,
        })),
      }
    }))
  }, [fileDiffs])

  async function pollForReviewCompletion() {
    const interval = setInterval(async () => {
      if (!pr.repoId) { clearInterval(interval); return }
      try {
        const details = await api.getPRDetailsForRepo(pr.repoId, pr.number)
        if (details.reviewingCurrentStep != null) setReviewStep(details.reviewingCurrentStep)
        if (!details.reviewingStartedAt) {
          clearInterval(interval)
          const cached = loadCachedReviews()
          if (cached.length > 0) { setMessages(cached); setHasReviewed(true) }
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
      setReviewing(true)
      setTimeout(() => {
        const result = mockReviewResults[pr.id] ?? Object.values(mockReviewResults)[0]
        const msg: ChatMessage = { id: `review-${Date.now()}`, role: "assistant", content: result.summary, isReview: true, comments: result.comments.map((c) => ({ ...c })), timestamp: new Date().toISOString() }
        setMessages((prev) => [...prev, msg])
        setReviewing(false)
        setHasReviewed(true)
      }, 2200)
      return
    }

    setReviewing(true)
    const msgId = `review-${Date.now()}`
    const streamMsg: ChatMessage = { id: msgId, role: "assistant", content: "", isReview: false, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, streamMsg])

    try {
      const response = await api.streamPRReview(pr.repoId, pr.number)
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as { error?: string; debug?: string[] }
        if (errBody.error === "not_configured") {
          const hint = errBody.debug?.length ? `\n\nChecked:\n${errBody.debug.join("\n")}` : ""
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
          if (line.startsWith(":")) continue
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6)
          if (data === "[DONE]") { done = true; break }
          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string; step?: number }
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.step != null) setReviewStep((prev) => Math.max(prev, parsed.step!))
            if (parsed.text) {
              accumulatedContent += parsed.text
              setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: m.content + parsed.text } : m)))
            }
          } catch (parseErr) {
            const msg = (parseErr as Error).message
            if (!msg.startsWith("Unexpected") && !msg.startsWith("JSON")) throw parseErr
          }
        }
      }

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
          verdict: (["approve", "request_changes", "comment"].includes(reviewData.verdict) ? reviewData.verdict : "comment") as ChatMessage["verdict"],
          comments,
        }
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, ...reviewMsg } : m))
        saveReviewCache({ id: msgId, role: "assistant", timestamp: new Date().toISOString(), ...reviewMsg } as ChatMessage)
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
      const fallback = `Review failed: ${errMsg}`
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: m.content || fallback } : m))
    } finally {
      setReviewing(false)
      setHasReviewed(true)
      isRerunRef.current = false
    }
  }

  function handleRerun() {
    if (reviewing || isSending) return
    clearReviewCache()
    if (pr.repoId) {
      api.clearPRChatMessages(pr.repoId, pr.number).catch(() => {})
    }
    isRerunRef.current = true
    triggerReview()
  }

  async function handleSend() {
    const text = input.trim()
    if ((!text && attachedThreads.length === 0) || isSending || reviewing) return

    let apiContent = text
    if (attachedThreads.length > 0) {
      const threadContext = attachedThreads.map((t) => {
        const loc = t.path ? `${t.path}${t.line ? `:${t.line}` : ""}` : null
        const body = t.comments.map((c) => `${c.author}: ${c.body.trim()}`).join("\n")
        return loc ? `Thread on \`${loc}\`:\n${body}` : body
      }).join("\n\n")
      apiContent = `Review comments:\n\n${threadContext}${text ? `\n\n---\n\n${text}` : ""}`
    }
    const displayContent = text || attachedThreads.map((t) => {
      const loc = t.path ? `${t.path.split("/").pop()}${t.line ? `:${t.line}` : ""}` : null
      return loc ? `[${loc}]` : "[comment]"
    }).join(", ")

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: displayContent, timestamp: new Date().toISOString() }
    const prevMessages = messages
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setAttachedThreads([])
    setIsSending(true)

    if (!pr.repoId) {
      setTimeout(() => {
        setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: "assistant", content: "I can see the code in this branch. Let me look into that for you.", timestamp: new Date().toISOString() }])
        setIsSending(false)
      }, 800)
      return
    }

    const msgId = `assistant-${Date.now()}`
    setMessages((prev) => [...prev, { id: msgId, role: "assistant", content: "", timestamp: new Date().toISOString() }])

    const apiMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...prevMessages.filter((m) => m.content).map((m) => ({ role: m.role, content: m.isReview ? `[Review summary]\n${m.content}` : m.content })),
      { role: "user" as const, content: apiContent },
    ]

    try {
      const response = await api.streamPRChat(pr.repoId, pr.number, apiMessages)
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Server error ${response.status}`)
      }
      if (!response.body) throw new Error("No response body")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let done = false
      while (!done) {
        const chunk = await reader.read()
        if (chunk.done) break
        buf += decoder.decode(chunk.value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (line.startsWith(":")) continue
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6)
          if (data === "[DONE]") { done = true; break }
          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string }
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.text) setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: m.content + parsed.text } : m))
          } catch (parseErr) {
            const msg = (parseErr as Error).message
            if (!msg.startsWith("Unexpected") && !msg.startsWith("JSON")) throw parseErr
          }
        }
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      toast.error((err as Error).message ?? "Failed to send message")
    } finally {
      setIsSending(false)
    }
  }

  function updateCommentStatus(commentId: string, status: ReviewComment["status"]) {
    setMessages((prev) => prev.map((m) =>
      m.isReview && m.comments
        ? { ...m, comments: m.comments.map((c) => c.id === commentId ? { ...c, status } : c) }
        : m
    ))
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, reviewing, isSending])

  function handleInputChange(val: string) {
    setInput(val)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }

  const canSend = (input.trim().length > 0 || attachedThreads.length > 0) && !isSending && !reviewing

  function handleAttachToChat(thread: PRThread) {
    setAttachedThreads((prev) => prev.some((t) => t.id === thread.id) ? prev : [...prev, thread])
    setActiveTab("review")
  }

  function addCommentFromReview(comment: ReviewComment) {
    const newPending: PendingReviewComment = {
      id: `pending-${Date.now()}-${comment.id}`,
      path: comment.path ?? "",
      line: comment.line ?? 0,
      body: comment.body,
      source: "agentic",
      codeContext: comment.codeContext,
    }
    savePendingComments((prev) => [...prev, newPending])
    updateCommentStatus(comment.id, "queued")
  }

  function removeCommentFromReview(comment: ReviewComment) {
    savePendingComments((prev) => prev.filter((c) => !(c.path === comment.path && c.line === comment.line && c.body === comment.body)))
    updateCommentStatus(comment.id, "pending")
  }

  function addInlineComment(path: string, line: number, body: string) {
    const newPending: PendingReviewComment = {
      id: `pending-inline-${Date.now()}`,
      path,
      line,
      body,
      source: "inline",
    }
    savePendingComments((prev) => [...prev, newPending])
  }

  function handleSubmitReviewDone() {
    savePendingComments([])
    // Mark queued review comments as sent so they can't be re-queued
    setMessages((prev) => prev.map((msg) => {
      if (!msg.isReview || !msg.comments) return msg
      return { ...msg, comments: msg.comments.map((c) => c.status === "queued" ? { ...c, status: "sent" as const } : c) }
    }))
    onUserReviewed?.()
  }

  const title = prDetails?.title ?? pr.title
  const author = prDetails?.author ?? pr.author
  const avatarUrl = prDetails?.avatarUrl ?? pr.authorAvatar
  const prUrl = prDetails?.url ?? pr.url
  const createdAt = prDetails?.createdAt ?? ""

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

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
                  onClick={() => { if (isTauri) invoke("open_url", { url: prUrl }); else window.open(prUrl, "_blank") }}
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
                onSubmitted={handleSubmitReviewDone}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center gap-1 mt-3">
          {(["conversations", "review", "changes"] as const).map((tab) => {
            const labels = { conversations: "Conversations", review: "Agentic review", changes: "Changes" }
            const counts: Record<string, number | undefined> = {
              conversations: (issueComments.length + threads.length) || undefined,
              review: undefined,
              changes: prFiles.length || undefined,
            }
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
                  activeTab === tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
                )}
              >
                {labels[tab]}
                {counts[tab] != null && (
                  <span className={cn(
                    "text-[10px] font-mono px-1 py-0.5 rounded",
                    activeTab === tab ? "bg-foreground/10 text-foreground/70" : "bg-secondary text-muted-foreground/50"
                  )}>
                    {counts[tab]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ── */}

      {/* Conversations tab */}
      {activeTab === "conversations" && (
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
          handleAttachToChat={handleAttachToChat}
        />
      )}

      {/* Agentic review tab */}
      {activeTab === "review" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Re-review banner */}
          {pr.unread && !hasReviewed && (
            <div className="mx-4 mt-3 shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-secondary border border-border">
              <IconRefresh size={13} className="text-muted-foreground/60 shrink-0" />
              <span className="text-[12px] text-muted-foreground flex-1">
                <span className="text-foreground font-medium">{author}</span> requested a re-review after your last comments.
              </span>
              <Button size="sm" className="h-6 text-[11px] px-2.5 gap-1 shrink-0" onClick={() => triggerReview()}>
                <IconEye size={11} />
                Re-review
              </Button>
            </div>
          )}

          {/* Loading / empty state */}
          {messages.length === 0 && !reviewing && !pr.unread && loadingDetails && (
            <PRLoadingView pr={pr} />
          )}

          {/* Review animation (first run only, not re-runs) */}
          {reviewing && !isRerunRef.current && messages.every((m) => !m.content) && (
            <ReviewingView pr={pr} currentStep={reviewStep} />
          )}

          {/* Messages */}
          {!(reviewing && !isRerunRef.current && messages.every((m) => !m.content)) && (messages.length > 0 || isSending) && (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="py-3">
                {messages.map((msg) => {
                  if (msg.isReview && msg.comments && msg.comments.length > 0) {
                    return (
                      <div key={msg.id} className="px-4 py-3">
                        {msg.content && (
                          <div className="mb-4 p-3 rounded-lg bg-secondary/40 border border-border text-[13px] text-foreground/80">
                            <MarkdownContent content={msg.content} />
                          </div>
                        )}
                        <div className="space-y-2">
                          {msg.comments.map((c) => {
                            const isQueued = pendingComments.some((p) => p.path === c.path && p.line === c.line && p.body === c.body)
                            return (
                              <ReviewCommentCard
                                key={c.id}
                                comment={c}
                                onDismiss={(id) => updateCommentStatus(id, c.status === "dismissed" ? "pending" : "dismissed")}
                                onAddToChat={(id) => {
                                  const thread: PRThread = {
                                    id: `comment-thread-${id}`,
                                    isResolved: false,
                                    isOutdated: false,
                                    path: c.path,
                                    line: c.line,
                                    comments: [{
                                      id,
                                      author: "AI",
                                      body: c.body,
                                      createdAt: new Date().toISOString(),
                                      url: "",
                                      isReply: false,
                                      path: c.path,
                                      line: c.line,
                                    }],
                                  }
                                  handleAttachToChat(thread)
                                }}
                                onQueue={() => addCommentFromReview(c)}
                                onDequeue={() => removeCommentFromReview(c)}
                                isQueued={isQueued}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  return <ChatMessageBubble key={msg.id} message={msg} />
                })}
                {reviewing && !messages.every((m) => !m.content) && messages[messages.length - 1]?.content === "" && (
                  <ReviewingInlineView currentStep={reviewStep} />
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 shrink-0">
            <div className="border border-border focus-within:border-ring bg-card rounded-xl transition-colors">
              {attachedThreads.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {attachedThreads.map((t) => {
                    const loc = t.path
                      ? `${t.path.split("/").pop()}${t.line ? `:${t.line}` : ""}`
                      : t.comments[0]?.author ?? "comment"
                    return (
                      <div key={t.id} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px]">
                        <IconMessageCircle2 size={12} className="text-muted-foreground/60 shrink-0" />
                        <span className="font-medium text-foreground/80">{loc}</span>
                        <button
                          onClick={() => setAttachedThreads((prev) => prev.filter((x) => x.id !== t.id))}
                          className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5"
                        >
                          <IconX size={11} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder={messages.length === 0 ? "Ask about this PR or the code…" : "Add a follow up"}
                rows={2}
                disabled={reviewing}
                className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
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
                    onClick={handleRerun}
                    disabled={reviewing}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
                      reviewing ? "opacity-40 cursor-not-allowed" : "hover:bg-accent text-muted-foreground/60"
                    )}
                  >
                    <IconRefresh size={13} />
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
        </div>
      )}

      {/* Changes tab */}
      {activeTab === "changes" && (
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
          <ResizablePanel defaultSize={72} minSize={50}>
            <div className="flex flex-col h-full overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
                <button
                  onClick={() => {
                    const allViewed = prFiles.every((f) => viewedFiles.has(f.path))
                    const newViewed = allViewed ? new Set<string>() : new Set(prFiles.map((f) => f.path))
                    setViewedFiles(newViewed)
                    if (viewedKey) localStorage.setItem(viewedKey, JSON.stringify(Array.from(newViewed)))
                  }}
                  className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <IconEye size={12} />
                  {prFiles.filter((f) => viewedFiles.has(f.path)).length}/{prFiles.length} viewed
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
                        onAddComment={addInlineComment}
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
          </ResizablePanel>

          <ResizableHandle />

          {/* File tree */}
          <ResizablePanel defaultSize={28} minSize={15}>
            <div className="flex flex-col h-full border-l border-border">
              <div className="px-3 py-2 border-b border-border shrink-0">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Files</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="py-1">
                  {buildPRFileTree(prFiles, viewedFiles).map((entry) => (
                    <PRFileTreeNode
                      key={entry.path}
                      entry={entry}
                      depth={0}
                      onSelect={(path) => {
                        const el = document.getElementById(`file-${path.replace(/\//g, "-")}`)
                        el?.scrollIntoView({ behavior: "smooth", block: "start" })
                        if (!expandedFiles.has(path)) {
                          setExpandedFiles((prev) => new Set([...prev, path]))
                        }
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

    </div>
  )
}
