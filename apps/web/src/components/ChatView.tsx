import React, { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { useAgents, useRepos, isAgentStreaming } from "@huxflux/shared"
import { Button } from "@huxflux/ui"
import { cn } from "@huxflux/ui"
import type { Agent, Message, FileChange, ToolCall, PRStatus, PRComment } from "@/data/mock"
import { api, getApiBase, getActiveServer } from "@huxflux/shared"
import { isTauri, handleExternalClick } from "@/lib/platform"
import { getFlag } from "@/lib/flags"
import { DiffView } from "@/components/DiffView"
import { FileContentView } from "@/components/FileContentView"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconSend,
  IconPlus,
  IconBrain,
  IconCopy,
  IconRefresh,
  IconGitBranch,
  IconPaperclip,
  IconX,
  IconFileCode,
  IconSparkles,
  IconBolt,
  IconLayoutGrid,
  IconTerminal2,
  IconFileText,
  IconKey,
  IconSearch,
  IconPencil,
  IconWorld,
  IconPlayerStop,
  IconHexagon,
  IconMap,
  IconArrowUpRight,
  IconMessageCircle,
  IconPhoto,
  IconFolderSymlink,
  IconUsers,
  IconLoader2,
  IconCheck,
  IconFolder,
  IconCode,
  IconTerminal,
  IconDatabase,
  IconClipboard,
} from "@tabler/icons-react"
import type { AgentSummary } from "@/data/mock"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import { Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { getSendWith, getAutoConvert, getStripYoureRight, getAlwaysContext } from "@/lib/notificationPrefs"

const OPEN_IN_APPS = [
  { key: "finder",   label: "Finder",   Icon: IconFolder,    shortcut: "1" },
  { key: "vscode",   label: "VS Code",  Icon: IconCode,      shortcut: "2" },
  { key: "cursor",   label: "Cursor",   Icon: IconCode,      shortcut: "3" },
  { key: "iterm",    label: "iTerm",    Icon: IconTerminal,  shortcut: "4" },
  { key: "terminal", label: "Terminal", Icon: IconTerminal2, shortcut: "5" },
  { key: "datagrip", label: "DataGrip", Icon: IconDatabase,  shortcut: "6" },
] as const

const OPEN_IN_KEY = "huxflux:open-in-last"
const SSH_CAPABLE_EDITORS = ["vscode", "cursor"]

function isRemoteServer(): boolean {
  const server = getActiveServer()
  if (!server) return false
  try {
    const h = new URL(server.url).hostname
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1"
  } catch { return false }
}

// Fallback models when providers API hasn't loaded yet
const FALLBACK_MODELS = [
  { id: "claude-opus-4-6",           label: "Opus 4.6",   provider: "claude" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6", provider: "claude" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",  provider: "claude" },
]


// ── Tool call helpers ─────────────────────────────────────────────────────────

function toolIcon(tool: string) {
  if (tool === "Bash") return <IconTerminal2 size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Read" || tool === "Write") return <IconFileText size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Edit") return <IconPencil size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Glob" || tool === "Grep") return <IconSearch size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Agent") return <IconSparkles size={12} className="text-muted-foreground/60 shrink-0" />
  return <IconKey size={12} className="text-muted-foreground/60 shrink-0" />
}

function truncateArgs(args: string, max = 52) {
  return args.length > max ? args.slice(0, max) + "…" : args
}

function basename(p: string): string {
  if (!p) return ""
  const parts = p.split("/")
  return parts[parts.length - 1] || p
}

// Returns a human-friendly { title, detail } for a tool call.
// `title` is the prominent label (the tool's description if provided, else
// something derived from the args). `detail` is the monospace summary next to it.
function formatToolCall(tool: string, args?: string): { title: string; detail: string } {
  if (!args) return { title: tool, detail: "" }
  let parsed: any
  try {
    parsed = JSON.parse(args)
  } catch {
    return { title: tool, detail: truncateArgs(args) }
  }

  // If the tool input includes a description (e.g. Bash sometimes does), prefer
  // it as the title regardless of which tool it is.
  const desc = typeof parsed?.description === "string" ? parsed.description.trim() : ""

  switch (tool) {
    case "Bash": {
      const cmd = String(parsed.command ?? "").trim()
      if (desc) return { title: desc, detail: truncateArgs(cmd) }
      // Fall back to using the command's first token as the title.
      const m = cmd.match(/^(\S+)\s*([\s\S]*)$/)
      if (!m) return { title: "Bash", detail: "" }
      return { title: m[1], detail: truncateArgs(m[2]) }
    }
    case "Grep": {
      const pat = String(parsed.pattern ?? "")
      const where = parsed.path
        ? ` in ${basename(String(parsed.path))}`
        : parsed.glob ? ` in ${parsed.glob}` : ""
      return { title: desc || "grep", detail: truncateArgs(`for "${pat}"${where}`) }
    }
    case "Glob":
      return { title: desc || "glob", detail: truncateArgs(String(parsed.pattern ?? "")) }
    case "Read":
      return { title: desc || "Read", detail: basename(String(parsed.file_path ?? "")) }
    case "Write":
      return { title: desc || "Write", detail: basename(String(parsed.file_path ?? "")) }
    case "Edit":
      return { title: desc || "Edit", detail: basename(String(parsed.file_path ?? "")) }
    case "TodoWrite":
      return { title: desc || "TodoWrite", detail: `${parsed.todos?.length ?? 0} todos` }
    case "WebFetch":
      return { title: desc || "WebFetch", detail: truncateArgs(String(parsed.url ?? "")) }
    case "WebSearch":
      return { title: desc || "WebSearch", detail: truncateArgs(String(parsed.query ?? "")) }
    case "AskUserQuestion": {
      const q = parsed.questions?.[0]?.question ?? ""
      return { title: desc || "Asking a question", detail: truncateArgs(q) }
    }
    default: {
      const firstKey = parsed && typeof parsed === "object" ? Object.keys(parsed)[0] : undefined
      const val = firstKey ? parsed[firstKey] : undefined
      const detail = typeof val === "string" ? val : typeof val === "number" ? String(val) : ""
      return { title: desc || tool, detail: truncateArgs(detail) }
    }
  }
}

// ── Inline result block ───────────────────────────────────────────────────────

function LinkedWorkspaceMessage({ sender, content }: { sender: string; content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0 text-muted-foreground/40", open && "rotate-90")} />
        <IconFolderSymlink size={13} className="text-blue-400/60 shrink-0" />
        <span>Linked workspace <span className="font-medium text-foreground/70">{sender}</span> sent message</span>
      </button>
      {open && (
        <div className="ml-[22px] mt-1.5 pl-3 border-l border-blue-400/15">
          <div className="text-sm text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
            <MarkdownContent content={content} />
          </div>
        </div>
      )}
    </div>
  )
}

function ResultBlock({ result }: { result: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const lines = result.split("\n")

  return (
    <div className="mt-1.5 ml-4 rounded-lg overflow-hidden border border-border/60">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-secondary/40 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <span>{lines.length} lines</span>
        <IconChevronDown size={10} className={cn("transition-transform", collapsed && "-rotate-90")} />
      </button>
      {!collapsed && (
        <div className="bg-card/60 px-3 py-2 overflow-x-auto">
          <pre className="text-[11px] font-mono text-foreground/70 leading-relaxed whitespace-pre">{result}</pre>
        </div>
      )}
    </div>
  )
}

// ── Agent prompt block ────────────────────────────────────────────────────────

function AgentPromptBlock({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-0.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0 text-muted-foreground/40", open && "rotate-90")} />
        <IconFileText size={12} className="text-muted-foreground/50 shrink-0" />
        <span className="text-muted-foreground/70">Prompt</span>
      </button>
      {open && (
        <div className="mt-1 rounded-lg overflow-hidden border border-border/60">
          <div className="bg-card/60 px-3 py-2.5 overflow-x-auto">
            <pre className="text-[11px] font-mono text-foreground/70 leading-relaxed whitespace-pre-wrap break-words">{prompt}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tool call row ─────────────────────────────────────────────────────────────

function ToolCallRow({ call, indent = false, isStreaming = false }: { call: ToolCall; indent?: boolean; isStreaming?: boolean }) {
  const [open, setOpen] = useState(true)
  const isAgent = call.tool === "Agent"

  if (isAgent) {
    let description = ""
    let prompt = ""
    if (call.args) {
      try {
        const parsed = JSON.parse(call.args)
        description = parsed.description ?? ""
        prompt = parsed.prompt ?? ""
      } catch { /* raw string fallback */ }
    }
    // A tool call is only "running" while the parent message is still
    // streaming AND no result has come back yet. Without the streaming guard,
    // any tool call that never received a result (e.g. legacy rows) would
    // spin forever after the message finished.
    const isRunning = isStreaming && !call.result
    const hasOutputText = !!(call.outputText && call.outputText.trim())
    const hasSubCalls = !!(call.subCalls && call.subCalls.length > 0)
    return (
      <div className={cn("mt-1", indent && "ml-4")}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
        >
          <IconChevronRight size={12} className={cn("transition-transform shrink-0", open && "rotate-90")} />
          {isRunning
            ? <IconLoader2 size={12} className="text-muted-foreground/70 shrink-0 animate-spin" />
            : <IconSparkles size={12} className="text-muted-foreground/60 shrink-0" />}
          <span className="font-medium text-foreground/80">Agent</span>
          {description && <span className="text-muted-foreground/60 ml-1 truncate">{description}</span>}
        </button>
        {open && (
          <div className="ml-3 mt-0.5 border-l border-border/50 pl-3 space-y-1.5">
            {prompt && <AgentPromptBlock prompt={prompt} />}
            {hasSubCalls && (
              <div className="space-y-0.5">
                {call.subCalls!.map((sub) => (
                  <ToolCallRow key={sub.id} call={sub} />
                ))}
              </div>
            )}
            {/* Human-readable text streamed by this sub-agent — kept tied to its row */}
            {hasOutputText && (
              <div className="mt-1 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
                <MarkdownContent content={call.outputText!} />
              </div>
            )}
            {isRunning && !hasOutputText && !hasSubCalls && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                <IconLoader2 size={11} className="animate-spin" />
                <span>Working…</span>
              </div>
            )}
            {/* Final result summary, once the sub-agent has finished */}
            {call.result && <ResultBlock result={call.result} />}
          </div>
        )}
      </div>
    )
  }

  const { title, detail } = formatToolCall(call.tool, call.args)
  return (
    <div className={cn("mt-0.5", indent && "ml-4")}>
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground py-0.5 min-w-0">
        {toolIcon(call.tool)}
        <span className="font-medium text-foreground/70 shrink-0">{title}</span>
        {detail && (
          <span className="font-mono text-[11px] text-muted-foreground/60 truncate min-w-0">
            {detail}
          </span>
        )}
      </div>
      {call.result && <ResultBlock result={call.result} />}
    </div>
  )
}

// ── Tool calls accordion ──────────────────────────────────────────────────────

function ToolCallsAccordion({ calls, isStreaming, pendingText }: { calls: ToolCall[]; hasContent?: boolean; isStreaming?: boolean; pendingText?: string }) {
  const [open, setOpen] = useState(isStreaming ?? false)
  const [userToggled, setUserToggled] = useState(false)

  // Stay open for the duration of streaming, then collapse once the message
  // is done. No more line-count threshold — that fought the user's reading
  // flow. User-toggle still wins.
  useEffect(() => {
    if (userToggled) return
    setOpen(!!isStreaming)
  }, [isStreaming, userToggled])

  const lastCall = calls[calls.length - 1]
  const label = calls.length === 1 ? "1 tool call" : `${calls.length} tool calls`
  // When collapsed and streaming, show the last tool call; otherwise show distinct tool names
  const summary = isStreaming && lastCall
    ? (() => {
        const { title, detail } = formatToolCall(lastCall.tool, lastCall.args)
        return detail ? `${title} ${detail}` : title
      })()
    : [...new Set(calls.map((c) => c.tool))].slice(0, 4).join(", ") + ([...new Set(calls.map((c) => c.tool))].length > 4 ? ", …" : "")

  return (
    <div className="mb-3">
      <button
        onClick={() => { setOpen(!open); setUserToggled(true) }}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5 group"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0", open && "rotate-90")} />
        {isStreaming
          ? <IconLoader2 size={12} className="text-muted-foreground/70 shrink-0 animate-spin" />
          : <IconBolt size={12} className="text-muted-foreground/50 shrink-0" />}
        <span className="font-medium text-foreground/70">{label}</span>
        {!open && (
          <span className="text-muted-foreground/40 ml-1 truncate">{summary}</span>
        )}
      </button>
      {open && (
        <div className="mt-0.5 ml-3 border-l border-border/50 pl-3 space-y-0.5">
          {calls.map((tc) => (
            <div key={tc.id}>
              {tc.precedingText && tc.precedingText.trim() && (
                <div className="my-1.5 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
                  <MarkdownContent content={tc.precedingText} />
                </div>
              )}
              <ToolCallRow call={tc} isStreaming={isStreaming} />
            </div>
          ))}
          {/* Live text being streamed since the last tool call. Stays inside
              the accordion so it doesn't flicker through msg.content. */}
          {pendingText && pendingText.trim() && (
            <div className="my-1.5 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
              <MarkdownContent content={pendingText} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Thinking block ────────────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.replace(/\s+/g, " ").trim()

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 text-left w-full group min-w-0"
      >
        <IconWorld size={13} className="text-muted-foreground/50 shrink-0 mt-0.5" />
        <span className="text-[12px] font-medium text-muted-foreground/70 shrink-0">Thinking</span>
        {!expanded && (
          <span className="text-[12px] text-muted-foreground/40 font-mono truncate ml-1 min-w-0 flex-1">{preview}</span>
        )}
      </button>
      {expanded && (
        <div className="mt-2 ml-5 bg-card/60 border border-border/60 rounded-lg px-4 py-3">
          <p className="text-[12px] font-mono text-muted-foreground/70 leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>
      )}
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ messages }: { messages: Message[] }) {
  const [collapsed, setCollapsed] = useState(false)
  let toolCount = 0
  let subagentCount = 0
  for (const m of messages) {
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        toolCount++
        if (tc.tool === "Agent") { subagentCount++; toolCount += (tc.subCalls?.length ?? 0) }
      }
    }
  }
  if (toolCount === 0) return null

  const parts = [
    `${toolCount} tool call${toolCount !== 1 ? "s" : ""}`,
    `${messages.length} message${messages.length !== 1 ? "s" : ""}`,
    subagentCount > 0 ? `${subagentCount} subagent` : null,
  ].filter(Boolean).join(", ")

  return (
    <div className="flex items-center gap-2 mb-4 text-[12px] text-muted-foreground/60">
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors">
        <IconChevronDown size={12} className={cn("transition-transform", collapsed && "-rotate-90")} />
        <span>{parts}</span>
      </button>
      <div className="ml-auto flex items-center gap-0.5">
        {[IconCopy, IconFileText, IconRefresh, IconTerminal2, IconSearch].map((Icon, i) => (
          <button key={i} className="p-1 hover:text-muted-foreground transition-colors rounded hover:bg-accent/40">
            <Icon size={12} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Team agent helpers ───────────────────────────────────────────────────────

interface TeamAgent {
  id: string
  description: string
  prompt?: string
  name?: string
  status: "running" | "done"
  subCalls?: ToolCall[]
  outputText?: string
  result?: string
}

function extractTeamAgents(messages: Message[], isStreaming?: boolean): TeamAgent[] {
  // Only show agents from the latest message that has Agent tool calls
  // so a new team supersedes the old one
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant" || !msg.toolCalls) continue
    const agentCalls = msg.toolCalls.filter((tc) => tc.tool === "Agent")
    if (agentCalls.length === 0) continue

    // Collect SendMessage calls directed at specific agents to show per-agent activity
    const sendMessages = msg.toolCalls.filter((tc) => tc.tool === "SendMessage")
    const sendMessagesByAgent = new Map<string, ToolCall[]>()
    for (const sm of sendMessages) {
      if (!sm.args) continue
      try {
        const parsed = JSON.parse(sm.args)
        const to = parsed.to as string | undefined
        if (to) {
          const existing = sendMessagesByAgent.get(to) ?? []
          existing.push(sm)
          sendMessagesByAgent.set(to, existing)
        }
      } catch (err) { console.warn("Failed to parse SendMessage args", sm.args, err) }
    }

    return agentCalls.map((tc) => {
      let description = "Agent"
      let prompt: string | undefined
      let name: string | undefined
      if (tc.args) {
        try {
          const parsed = JSON.parse(tc.args)
          description = parsed.description || parsed.prompt?.slice(0, 40) || "Agent"
          prompt = parsed.prompt
          name = parsed.name
        } catch {
          description = tc.args.length > 40 ? tc.args.slice(0, 40) + "…" : tc.args
        }
      }

      // Build sub-calls: actual subCalls + any SendMessage calls targeting this agent by name
      let combinedSubCalls = tc.subCalls ? [...tc.subCalls] : []
      if (name) {
        const directed = sendMessagesByAgent.get(name)
        if (directed) combinedSubCalls = [...combinedSubCalls, ...directed]
      }

      return {
        id: tc.id,
        description,
        prompt,
        name,
        status: (!isStreaming || tc.result != null) ? "done" as const : "running" as const,
        subCalls: combinedSubCalls.length > 0 ? combinedSubCalls : undefined,
        outputText: tc.outputText,
        result: tc.result,
      }
    })
  }
  return []
}

function TeamAgentOutput({ selected }: { selected: TeamAgent }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [toolsOpen, setToolsOpen] = useState(true)
  const [toolsUserToggled, setToolsUserToggled] = useState(false)
  const hasSubCalls = selected.subCalls && selected.subCalls.length > 0
  const subCallCount = selected.subCalls?.length ?? 0
  const hasOutput = selected.outputText && selected.outputText.trim()
  const hasResult = selected.result && selected.result.trim()

  // Collapse tools accordion when agent finishes, or once 10+ sub-calls have accrued
  useEffect(() => {
    if (toolsUserToggled) return
    if (selected.status === "done" || subCallCount >= 10) setToolsOpen(false)
    else setToolsOpen(true)
  }, [selected.status, subCallCount, toolsUserToggled])

  // Auto-scroll when content changes
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [selected.subCalls?.length, selected.outputText, selected.result])

  return (
    <div ref={scrollRef} className="max-h-56 overflow-y-auto px-4 py-3 space-y-2">
      {/* Task description */}
      {selected.prompt && (
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-2">{selected.prompt}</p>
      )}

      {/* Tool calls accordion */}
      {hasSubCalls && (
        <div>
          <button
            onClick={() => { setToolsOpen(!toolsOpen); setToolsUserToggled(true) }}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
          >
            <IconChevronRight size={11} className={cn("transition-transform shrink-0", toolsOpen && "rotate-90")} />
            {selected.status === "running"
              ? <IconLoader2 size={11} className="text-muted-foreground/70 shrink-0 animate-spin" />
              : <IconBolt size={11} className="text-muted-foreground/50 shrink-0" />}
            <span className="font-medium text-foreground/70">
              {selected.subCalls!.length === 1 ? "1 tool call" : `${selected.subCalls!.length} tool calls`}
            </span>
          </button>
          {toolsOpen && (
            <div className="mt-0.5 ml-3 border-l border-border/50 pl-3 space-y-0.5">
              {selected.subCalls!.map((sub) => (
                <ToolCallRow key={sub.id} call={sub} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Text output streamed by the sub-agent */}
      {hasOutput && (
        <div className="text-[11px] text-foreground/80 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[10px] [&_pre]:text-[10px]">
          <MarkdownContent content={selected.outputText ?? ""} />
        </div>
      )}

      {/* Final result */}
      {hasResult && !hasOutput && (
        <pre className="text-[11px] font-mono text-foreground/70 leading-relaxed whitespace-pre-wrap">{selected.result}</pre>
      )}

      {/* Idle placeholder */}
      {selected.status === "running" && !hasSubCalls && !hasOutput && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
          <IconLoader2 size={12} className="animate-spin" />
          <span>Running in background…</span>
        </div>
      )}
    </div>
  )
}

function TeamAgentBar({ agents, isStreaming, agentId }: { agents: TeamAgent[]; isStreaming?: boolean; agentId: string }) {
  const storageKey = `huxflux-team-dismissed-${agentId}`
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedUserToggled, setCollapsedUserToggled] = useState(false)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "1")

  // Auto-collapse the panel when no agents are running anymore — unless user toggled
  const anyRunning = agents.some((a) => a.status === "running")
  useEffect(() => {
    if (collapsedUserToggled) return
    setCollapsed(!anyRunning)
  }, [anyRunning, collapsedUserToggled])

  // Re-show when new agent IDs appear (handles dismiss → new team)
  useEffect(() => {
    const newIds = agents.filter((a) => !knownIdsRef.current.has(a.id))
    if (newIds.length > 0) {
      for (const a of newIds) knownIdsRef.current.add(a.id)
      localStorage.removeItem(storageKey)
      setDismissed(false)
      if (!selectedId || !agents.some((a) => a.id === selectedId)) {
        setSelectedId(newIds[0].id)
      }
    }
  }, [agents]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    localStorage.setItem(storageKey, "1")
    setDismissed(true)
  }

  if (dismissed || agents.length < 2) return null

  const selected = agents.find((a) => a.id === selectedId) ?? agents[0]
  const runningCount = agents.filter((a) => a.status === "running").length
  const doneCount = agents.filter((a) => a.status === "done").length

  return (
    <div className="mx-2 mb-2 rounded-xl border border-border bg-card overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto">
        <button
          onClick={() => { setCollapsed(!collapsed); setCollapsedUserToggled(true) }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
        >
          <IconUsers size={12} className="text-muted-foreground/50" />
          <span>Team</span>
          <span className="text-muted-foreground/40 font-mono ml-0.5">
            {runningCount > 0 && `${runningCount} running`}
            {runningCount > 0 && doneCount > 0 && ", "}
            {doneCount > 0 && `${doneCount} done`}
          </span>
          <IconChevronDown size={11} className={cn("transition-transform ml-0.5", collapsed && "-rotate-90")} />
        </button>
        <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />
        {agents.map((agent) => {
          const isActive = agent.id === selected.id
          return (
            <button
              key={agent.id}
              onClick={() => { setSelectedId(agent.id); setCollapsed(false); setCollapsedUserToggled(true) }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              {agent.status === "running" && isStreaming ? (
                <IconLoader2 size={11} className="animate-spin text-amber-400 shrink-0" />
              ) : (
                <IconCheck size={11} className="text-emerald-400 shrink-0" />
              )}
              <span className="max-w-[140px] truncate">{agent.description}</span>
            </button>
          )
        })}
        <button
          onClick={handleDismiss}
          className="ml-auto p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
        >
          <IconX size={11} />
        </button>
      </div>

      {/* Output panel */}
      {!collapsed && selected && (
        <div className="border-t border-border/60 px-3">
          <TeamAgentOutput selected={selected} />
        </div>
      )}
    </div>
  )
}

// ── Terminal chip with hover preview ─────────────────────────────────────────

function TerminalChip({ agentId, onRemove }: { agentId: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always fetch so data is ready before first hover
  const { data: lines = [] } = useQuery({
    queryKey: ["terminal-preview", agentId],
    queryFn: () => api.getTerminal(agentId),
    staleTime: 10_000,
  })

  function handleEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px] cursor-default">
        <IconTerminal2 size={12} className="text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-foreground/80">Terminal output</span>
        <button onClick={onRemove} className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5">
          <IconX size={11} />
        </button>
      </div>
      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 w-[400px] rounded-xl border border-border bg-[#0d0d0d] shadow-2xl overflow-hidden"
          style={{ zIndex: 9999 }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-[#141414]">
            <div className="flex items-center gap-2">
              <IconTerminal2 size={11} className="text-muted-foreground/50" />
              <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Terminal</span>
            </div>
            <span className="text-[10px] text-emerald-400/70 font-medium">● running</span>
          </div>
          {lines.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] font-mono text-white/30">No terminal output yet</div>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full border-collapse">
                <tbody>
                  {lines.slice(-40).map((line, i) => (
                    <tr key={i} className="hover:bg-white/[0.03]">
                      <td className="select-none text-right pr-3 pl-3 py-[1px] text-[10px] font-mono text-white/20 w-8 shrink-0 align-top">
                        {Math.max(lines.length - 40, 0) + i + 1}
                      </td>
                      <td className="pr-3 py-[1px] text-[11px] font-mono text-white/70 leading-relaxed whitespace-pre">
                        {line || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── @ mention row with preview ────────────────────────────────────────────────

function MentionRow({
  option,
  agentId,
  isActive,
  onSelect,
  rowRef,
}: {
  option: { type: "file" | "terminal"; name: string; path: string }
  agentId: string
  isActive: boolean
  onSelect: () => void
  rowRef?: React.Ref<HTMLDivElement>
}) {
  const [open, setOpen] = useState(false)
  const { data: previewLines } = useQuery({
    queryKey: ["mention-preview", agentId, option.type === "terminal" ? "__terminal__" : option.path],
    queryFn: () =>
      option.type === "terminal"
        ? api.getTerminal(agentId)
        : api.getFileContent(agentId, option.path).then((c) => c.split("\n")),
    enabled: open,
    staleTime: 30_000,
  })

  const dir = option.path.includes("/") ? option.path.split("/").slice(0, -1).join("/") + "/" : ""
  const lines: string[] = previewLines ?? []

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onMouseDown={(e) => { e.preventDefault(); onSelect() }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
          isActive ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        {option.type === "terminal"
          ? <IconTerminal2 size={13} className="text-muted-foreground/60 shrink-0" />
          : <IconFileCode size={13} className="text-muted-foreground/60 shrink-0" />
        }
        <span className="text-[12px] font-medium text-foreground/80 shrink-0">{option.name}</span>
        {dir && <span className="text-[11px] text-muted-foreground/40 truncate">{dir}</span>}
      </button>
      {open && lines.length > 0 && (
        <div className="absolute left-full top-0 ml-2 w-[380px] z-20 rounded-xl border border-border bg-[#0d0d0d] shadow-2xl overflow-hidden pointer-events-none">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-[#141414]">
            <div className="flex items-center gap-2">
              <IconTerminal2 size={11} className="text-muted-foreground/50" />
              <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {option.type === "terminal" ? "Terminal" : option.path}
              </span>
            </div>
            {option.type === "terminal" && (
              <span className="text-[10px] text-emerald-400/70 font-medium">● running</span>
            )}
          </div>
          {/* Line-numbered content */}
          <div className="max-h-52 overflow-y-auto">
            <table className="w-full border-collapse">
              <tbody>
                {lines.slice(-40).map((line, i) => {
                  const lineNum = option.type === "terminal"
                    ? lines.length - 40 + i + 1
                    : i + 1
                  return (
                    <tr key={i} className="hover:bg-white/[0.03]">
                      <td className="select-none text-right pr-3 pl-3 py-[1px] text-[10px] font-mono text-white/20 w-8 shrink-0 align-top">
                        {lineNum > 0 ? lineNum : i + 1}
                      </td>
                      <td className="pr-3 py-[1px] text-[11px] font-mono text-white/70 leading-relaxed whitespace-pre break-all">
                        {line || " "}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Todo extraction ───────────────────────────────────────────────────────────

interface TodoItem {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed"
  priority?: "low" | "medium" | "high"
}

function extractLatestTodos(messages: Message[]): TodoItem[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg.toolCalls) continue
    for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
      const tc = msg.toolCalls[j]
      if (tc.tool !== "TodoWrite") continue
      try {
        const parsed = JSON.parse(tc.args ?? "{}")
        const todos = parsed.todos ?? parsed
        if (Array.isArray(todos) && todos.length > 0) return todos as TodoItem[]
      } catch { /* ignore */ }
    }
  }
  return []
}

function TasksBar({ todos, agentId, isStreaming }: { todos: TodoItem[]; agentId: string; isStreaming?: boolean }) {
  const storageKey = `huxflux-tasks-dismissed-${agentId}`
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem(storageKey)
    return stored !== null && parseInt(stored) >= todos.length
  })
  const prevCountRef = useRef(todos.length)

  useEffect(() => {
    if (todos.length > prevCountRef.current) {
      prevCountRef.current = todos.length
      localStorage.removeItem(storageKey)
      setDismissed(false)
    } else {
      prevCountRef.current = todos.length
    }
  }, [todos.length, storageKey])

  function handleDismiss() {
    localStorage.setItem(storageKey, String(todos.length))
    setDismissed(true)
  }

  if (dismissed || todos.length === 0 || (!isStreaming && todos.every((t) => t.status === "completed" || t.status === "pending"))) return null

  const doneCount = todos.filter((t) => t.status === "completed").length
  const inProgressCount = todos.filter((t) => t.status === "in_progress").length

  return (
    <div className="mx-2 mb-2 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <IconCheck size={12} className="text-muted-foreground/50" />
          <span>Tasks</span>
          <span className="text-muted-foreground/40 font-mono ml-0.5">
            {doneCount}/{todos.length}
            {inProgressCount > 0 && ` · ${inProgressCount} active`}
          </span>
          <IconChevronDown size={11} className={cn("transition-transform ml-0.5", collapsed && "-rotate-90")} />
        </button>
        <button
          onClick={handleDismiss}
          className="ml-auto p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <IconX size={11} />
        </button>
      </div>
      {!collapsed && (
        <div className="border-t border-border/60 px-3 py-2 space-y-1">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-start gap-2">
              <div className={cn(
                "mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center",
                todo.status === "completed"
                  ? "bg-emerald-500/20 border-emerald-500/50"
                  : todo.status === "in_progress"
                    ? "border-amber-400/60 bg-amber-500/10"
                    : "border-border"
              )}>
                {todo.status === "completed" && <IconCheck size={9} className="text-emerald-400" />}
                {todo.status === "in_progress" && <IconLoader2 size={9} className="text-amber-400 animate-spin" />}
              </div>
              <span className={cn(
                "text-[12px] leading-snug",
                todo.status === "completed" ? "text-muted-foreground/50 line-through" : "text-foreground/80"
              )}>
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Table block ───────────────────────────────────────────────────────────────

function TableBlock({ children }: { node?: any; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  function copyTable() {
    if (!tableRef.current) return
    const rows = Array.from(tableRef.current.rows).map((row) =>
      Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? "")
    )
    if (rows.length === 0) return
    const [header, ...body] = rows
    const sep = header.map(() => "---")
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
      ...body.map((r) => `| ${r.join(" | ")} |`),
    ]
    navigator.clipboard.writeText(lines.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative my-4 group">
      <button
        onClick={copyTable}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] text-muted-foreground hover:text-foreground z-10"
      >
        {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table ref={tableRef} className="w-full text-[13px] border-collapse">{children}</table>
      </div>
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-")
          if (isBlock) {
            return (
              <code className="block font-mono text-[12px] bg-secondary border border-border rounded-lg px-4 py-3 my-3 overflow-x-auto text-foreground/80 leading-relaxed whitespace-pre">
                {children}
              </code>
            )
          }
          return (
            <code className="font-mono text-[12px] bg-secondary border border-border px-1.5 py-0.5 rounded text-foreground">
              {children}
            </code>
          )
        },
        pre: ({ children }) => <>{children}</>,
        h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-4 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-foreground mt-4 mb-2 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-3 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 text-muted-foreground my-3">{children}</blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleExternalClick} className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
            {children}
          </a>
        ),
        hr: () => <hr className="border-border my-4" />,
        table: ({ node, children }) => <TableBlock node={node}>{children}</TableBlock>,
        thead: ({ children }) => <thead className="border-b border-border bg-secondary/40">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-border/50">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-accent/20 transition-colors">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wide whitespace-nowrap">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-foreground/80 leading-relaxed">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

// ── Typing indicator ──────────────────────────────────────────────────────────

// ── AskUserQuestion card ─────────────────────────────────────────────────────

function AskUserQuestionCard({
  questions,
  onSubmit,
}: {
  questions: Array<{ question: string; header?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }>
  onSubmit: (answers: Record<string, string>) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [step, setStep] = useState(0)

  const total = questions.length
  const q = questions[step]
  const currentAnswer = q ? answers[q.question]?.trim() : ""
  const isLast = step === total - 1

  if (!q) return null

  return (
    <div className="mb-3 rounded-xl border border-blue-400/30 bg-blue-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-400/20 bg-blue-500/5">
        <IconMessageCircle size={13} className="text-blue-400 shrink-0" />
        <span className="text-[12px] font-medium text-blue-400/90">Claude is asking a question</span>
        {total > 1 && (
          <span className="text-[10px] font-mono text-blue-400/50 ml-auto">{step + 1}/{total}</span>
        )}
      </div>
      <div className="px-3 py-3">
        {q.header && <p className="text-[11px] font-semibold text-foreground/60 uppercase tracking-wider mb-1.5">{q.header}</p>}
        <p className="text-[13px] text-foreground mb-2.5">{q.question}</p>
        {q.options && q.options.length > 0 ? (
          <div className="space-y-1">
            {q.options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  setAnswers((prev) => ({ ...prev, [q.question]: opt.label }))
                  // Auto-advance after a short delay so the selection is visible
                  if (!isLast) setTimeout(() => setStep((s) => s + 1), 200)
                }}
                className={cn(
                  "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors text-[12px]",
                  answers[q.question] === opt.label
                    ? "border-blue-400/50 bg-blue-500/10 text-foreground"
                    : "border-border bg-card hover:bg-accent text-foreground/80"
                )}
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors",
                  answers[q.question] === opt.label ? "border-blue-400 bg-blue-400" : "border-muted-foreground/30"
                )}>
                  {answers[q.question] === opt.label && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <span className="font-medium">{opt.label}</span>
                  {opt.description && <span className="text-muted-foreground/60 ml-1.5">{opt.description}</span>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <input
            type="text"
            placeholder="Type your answer…"
            value={answers[q.question] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.question]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && currentAnswer) {
                if (isLast) onSubmit(answers)
                else setStep((s) => s + 1)
              }
            }}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring"
            autoFocus
          />
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-blue-400/20">
        <div>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Back
            </button>
          )}
        </div>
        <Button
          size="sm"
          className="h-7 text-[11px] px-3 gap-1"
          disabled={!currentAnswer}
          onClick={() => {
            if (isLast) onSubmit(answers)
            else setStep((s) => s + 1)
          }}
        >
          {isLast ? (
            <>
              <IconCheck size={12} />
              Submit
            </>
          ) : (
            "Next"
          )}
        </Button>
      </div>
      {/* Step dots */}
      {total > 1 && (
        <div className="flex justify-center gap-1 pb-2">
          {questions.map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                i === step ? "bg-blue-400" : i < step && answers[questions[i].question] ? "bg-blue-400/40" : "bg-muted-foreground/20"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TypingBubble({ elapsedSeconds }: { elapsedSeconds: number }) {
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")
  const ss = String(elapsedSeconds % 60).padStart(2, "0")
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-muted-foreground/30"
            style={{
              animation: `typingBounce 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
        <span className="text-[11px] font-mono text-muted-foreground/40 tabular-nums ml-0.5">{mm}:{ss}</span>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({ msg, isStreaming: isStreamingProp }: { msg: Message; isStreaming?: boolean }) {
  const isUser = msg.role === "user"
  // Belt-and-braces: even if the parent's derived isStreaming hasn't flipped
  // yet (cache update race), `durationMs` being set means this message is
  // definitively done — clamp the spinner state locally.
  const isStreaming = !!isStreamingProp && msg.durationMs == null
  const pendingText = msg.pendingText ?? ""
  const hasPending = pendingText.trim().length > 0
  // A non-streaming message with only tool calls and no text/thinking is not shown —
  // the tool calls accordion only renders alongside actual content (see below).
  const isEmpty = !msg.content && !msg.thinking && !hasPending && (!msg.toolCalls || msg.toolCalls.length === 0)

  // Messages from linked workspaces — collapsed accordion
  if (isUser && msg.sender) {
    return <LinkedWorkspaceMessage sender={msg.sender} content={msg.content} />
  }

  if (isUser) {
    // Parse out "Attached files:\n- name: /path\n...\n\n---\n\n" prefix
    const attachmentMatch = msg.content.match(/^Attached files:\n([\s\S]*?)\n\n---\n\n([\s\S]*)$/)
    const linkedAgentMatch = (attachmentMatch ? attachmentMatch[2] : msg.content)
      .match(/^([\s\S]*?)\n\n---\n\nLinked agents for cross-repo collaboration:\n[\s\S]*$/)

    const files: { name: string; mimeType?: string }[] = attachmentMatch
      ? attachmentMatch[1].split("\n").filter(Boolean).map((line) => {
          const m = line.match(/^- (.+?): /)
          return m ? { name: m[1] } : null
        }).filter(Boolean) as { name: string }[]
      : []

    const displayText = linkedAgentMatch
      ? linkedAgentMatch[1].trim()
      : (attachmentMatch ? attachmentMatch[2] : msg.content).replace(/\n\n---\n\nLinked agents[\s\S]*$/, "").trim()

    return (
      <div className="mb-5 flex justify-end">
        <div className="bg-card border border-border rounded-xl px-5 py-4 space-y-3 max-w-[80%]">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-[11px]">
                  <IconPaperclip size={12} className="text-muted-foreground/60 shrink-0" />
                  <span className="font-medium text-foreground/80 max-w-[160px] truncate">{f.name}</span>
                </div>
              ))}
            </div>
          )}
          {displayText && (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
              {displayText.split(/(@[\w./\-]+)/g).map((part, i) =>
                /^@[\w./\-]+$/.test(part)
                  ? <span key={i} className="font-mono text-[12px] text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">{part}</span>
                  : part
              )}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Empty in-flight assistant message — nothing yet, typing bubble shown separately
  if (isEmpty) {
    return null
  }

  return (
    <div className="mb-5 max-w-4xl">
      {/* Thinking */}
      {msg.thinking && <ThinkingBlock text={msg.thinking} />}

      {/* Tool calls + live streaming text. Show whenever there are tool
          calls, OR while a streaming chunk is in flight (so intermediate
          text gets a home before the first tool call exists). */}
      {((msg.toolCalls && msg.toolCalls.length > 0) || (isStreaming && hasPending)) && (
        <ToolCallsAccordion
          calls={msg.toolCalls ?? []}
          hasContent={!!msg.content}
          isStreaming={isStreaming}
          pendingText={pendingText}
        />
      )}

      {/* Content */}
      {msg.content && (
        <div className="text-sm text-foreground leading-relaxed">
          <MarkdownContent content={getStripYoureRight()
            ? msg.content.replace(/^(You're (absolutely |completely |totally |entirely )?right[!.,]?\s*)+/i, "")
            : msg.content}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-2.5">
        {msg.durationMs != null && (
          <>
            <Popover>
              <PopoverTrigger className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors cursor-pointer select-none">
                  {msg.durationMs < 1000
                    ? `${msg.durationMs}ms`
                    : `${(msg.durationMs / 1000).toFixed(0)}s`}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 text-xs p-3 space-y-2">
                {msg.model && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model</span>
                    <span className="font-medium">{msg.model}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">{msg.timestamp}</span>
                </div>
                {(msg.inputTokens != null || msg.outputTokens != null) && (
                  <div className="border-t pt-2 space-y-1.5">
                    {msg.inputTokens != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Input</span>
                        <span className="font-medium">{msg.inputTokens.toLocaleString()}</span>
                      </div>
                    )}
                    {msg.outputTokens != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Output</span>
                        <span className="font-medium">{msg.outputTokens.toLocaleString()}</span>
                      </div>
                    )}
                    {msg.cacheReadTokens != null && msg.cacheReadTokens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cache read</span>
                        <span className="font-medium">{msg.cacheReadTokens.toLocaleString()}</span>
                      </div>
                    )}
                    {msg.cacheWriteTokens != null && msg.cacheWriteTokens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cache write</span>
                        <span className="font-medium">{msg.cacheWriteTokens.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground/25">·</span>
          </>
        )}
        {msg.model && (
          <>
            <span className="text-[11px] text-muted-foreground/40">{msg.model}</span>
            <span className="text-muted-foreground/25">·</span>
          </>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground/40 hover:text-muted-foreground/80"
          onClick={() => navigator.clipboard.writeText(msg.content)}
        >
          <IconCopy size={12} />
        </Button>
      </div>
    </div>
  )
})

// ── PR status pill ────────────────────────────────────────────────────────────

function PRStatusPill({ prStatus, agentId }: { prStatus: PRStatus; agentId: string }) {
  const [marking, setMarking] = useState(false)
  const [rerequesting, setRerequesting] = useState(false)
  const [merging, setMerging] = useState(false)

  async function handleMarkReady() {
    setMarking(true)
    try {
      await api.markPRReady(agentId)
    } finally {
      setMarking(false)
    }
  }

  async function handleRerequestReview() {
    setRerequesting(true)
    try {
      await api.rerequestReview(agentId)
      toast.success("Review re-requested")
    } catch (err) {
      toast.error(`Failed to re-request review: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setRerequesting(false)
    }
  }

  async function handleMerge() {
    setMerging(true)
    try {
      await api.mergePR(agentId)
      toast.success("PR merged")
    } catch (err) {
      toast.error(`Merge failed: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setMerging(false)
    }
  }

  const isReadyToMerge = prStatus.state === "open" && !prStatus.draft && !prStatus.hasChangeRequests && prStatus.mergeableState !== "behind" && prStatus.mergeableState !== "blocked" && prStatus.mergeableState !== "dirty"

  const { label, pill } = (() => {
    if (prStatus.merged)
      return { label: "Merged", pill: "bg-purple-500/10 border-purple-500/25 text-purple-400" }
    if (prStatus.draft)
      return { label: "Draft PR open", pill: "bg-zinc-500/10 border-zinc-500/25 text-zinc-400" }
    if (prStatus.hasChangeRequests)
      return { label: "PR changes requested", pill: "bg-orange-500/10 border-orange-500/25 text-orange-400" }
    if (prStatus.mergeableState === "blocked" || prStatus.mergeableState === "dirty")
      return { label: prStatus.mergeableState === "dirty" ? "Merge conflict" : "Blocked", pill: "bg-red-500/10 border-red-500/25 text-red-400" }
    if (isReadyToMerge)
      return { label: "Ready to merge", pill: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" }
    return { label: "In review", pill: "bg-blue-500/10 border-blue-500/25 text-blue-400" }
  })()

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={prStatus.url}
        target="_blank"
        rel="noreferrer"
        onClick={handleExternalClick}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary border border-border text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors"
      >
        #{prStatus.number}
        <IconArrowUpRight size={10} />
      </a>
      <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium", pill)}>
        {label}
      </div>
      {isReadyToMerge && (
        <Button
          size="sm"
          className="h-5 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md"
          onClick={handleMerge}
          disabled={merging}
        >
          {merging ? "Merging…" : "Merge"}
        </Button>
      )}
      {prStatus.draft && !prStatus.merged && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-md"
          onClick={handleMarkReady}
          disabled={marking}
        >
          Mark ready
        </Button>
      )}
      {(prStatus.hasChangeRequests || prStatus.hasDismissedReviews) && !prStatus.merged && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={handleRerequestReview}
          disabled={rerequesting}
        >
          Re-request review
        </Button>
      )}
    </div>
  )
}

// ── Creation view ─────────────────────────────────────────────────────────────

function CreationView({ agent }: { agent: Agent }) {
  const [showCursor, setShowCursor] = useState(true)
  const [typedText, setTypedText] = useState("")
  const fullText = "Send a message to get started"
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: -1, y: -1 })
  const particleRefs = useRef<(HTMLDivElement | null)[]>([])
  const animFrameRef = useRef<number>(0)
  const timeRef = useRef(0)

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(interval)
      }
    }, 45)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setShowCursor((c) => !c), 530)
    return () => clearInterval(interval)
  }, [])

  // Floating particle positions (seeded for consistency)
  const particles = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    id: i,
    x: ((i * 37 + 13) % 100),
    y: ((i * 53 + 7) % 100),
    size: 2.5 + (i % 5) * 1.2,
    duration: 3 + (i % 7) * 0.9,
    delay: (i % 11) * 0.3,
    opacity: 0.1 + (i % 4) * 0.08,
    phase: (i * 2.39996) % (Math.PI * 2), // golden angle offset for varied motion
  })), [])

  // Mouse tracking
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onLeave = () => { mouseRef.current = { x: -1, y: -1 } }
    container.addEventListener("mousemove", onMove)
    container.addEventListener("mouseleave", onLeave)
    return () => {
      container.removeEventListener("mousemove", onMove)
      container.removeEventListener("mouseleave", onLeave)
    }
  }, [])

  // Animation loop for magnetic attraction + floating
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let lastTime = performance.now()

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000
      lastTime = now
      timeRef.current += dt

      const cw = container.offsetWidth
      const ch = container.offsetHeight
      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const hasMouse = mx >= 0 && my >= 0

      for (let i = 0; i < particles.length; i++) {
        const el = particleRefs.current[i]
        if (!el) continue
        const p = particles[i]

        // Base position as percentage of container
        const baseX = (p.x / 100) * cw
        const baseY = (p.y / 100) * ch

        // Floating offset (unique phase per particle)
        const t = timeRef.current
        const floatX = Math.sin(t / p.duration * Math.PI * 2 + p.phase) * 15
        const floatY = Math.cos(t / p.duration * Math.PI * 2 + p.phase * 1.3) * 20
        const floatScale = 1 + Math.sin(t / p.duration * Math.PI * 2 + p.phase * 0.7) * 0.3

        let finalX = baseX + floatX
        let finalY = baseY + floatY
        let opacityMul = 1

        // Magnetic attraction toward cursor
        if (hasMouse) {
          const dx = mx - finalX
          const dy = my - finalY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radius = 500
          if (dist < radius) {
            const strength = (1 - dist / radius) ** 2 * 60
            finalX -= (dx / dist) * strength
            finalY -= (dy / dist) * strength
            opacityMul = 1 + (1 - dist / radius) * 1.5
          }
        }

        el.style.transform = `translate(${finalX}px, ${finalY}px) scale(${floatScale})`
        el.style.opacity = String(Math.min(p.opacity * opacityMul, 0.7))
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [particles])

  // Click to spawn flying symbols
  const [flyingSymbols, setFlyingSymbols] = useState<{ id: number; x: number; y: number; symbol: string; flyX: number; flyY: number; fontSize: number }[]>([])
  const symbolIdRef = useRef(0)
  const symbols = ["✦", "⟡", "◈", "⬡", "✧", "⊹", "⟐", "◇", "❖", "⊛", "✶", "⟢", "△", "○", "☆"]

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement) !== container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const angle = Math.random() * Math.PI * 2
      const flyDist = 250 + Math.random() * 200
      const symbol = symbols[Math.floor(Math.random() * symbols.length)]
      const id = symbolIdRef.current++
      setFlyingSymbols((prev) => [...prev, {
        id, x, y, symbol,
        flyX: Math.cos(angle) * flyDist,
        flyY: Math.sin(angle) * flyDist,
        fontSize: 18 + Math.random() * 14,
      }])
      setTimeout(() => {
        setFlyingSymbols((prev) => prev.filter((s) => s.id !== id))
      }, 2000)
    }
    container.addEventListener("click", onClick)
    return () => container.removeEventListener("click", onClick)
  }, [])

  return (
    <div ref={containerRef} className="relative flex flex-col items-center justify-center h-full gap-6 px-8 overflow-hidden">
      {/* CSS animations */}
      <style>{`
        @keyframes cv-float { 0%, 100% { transform: translateY(0px) } 50% { transform: translateY(-12px) } }
        @keyframes cv-symbol-fly {
          0% { transform: translate(0, 0) scale(0.5); opacity: 1 }
          100% { transform: translate(var(--fly-x), var(--fly-y)) scale(1.5); opacity: 0 }
        }
        @keyframes cv-spin-slow { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes cv-pulse-ring { 0% { transform: scale(1); opacity: 0.4 } 100% { transform: scale(2.5); opacity: 0 } }
        @keyframes cv-glow { 0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.08), 0 0 60px rgba(251,191,36,0.04) } 50% { box-shadow: 0 0 30px rgba(251,191,36,0.15), 0 0 80px rgba(251,191,36,0.08) } }
        @keyframes cv-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes cv-fade-in { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes cv-hex-bob { 0%, 100% { transform: rotate(0deg) scale(1) } 25% { transform: rotate(3deg) scale(1.05) } 75% { transform: rotate(-3deg) scale(1.05) } }
        @keyframes cv-orbit { from { transform: rotate(0deg) translateX(32px) rotate(0deg) } to { transform: rotate(360deg) translateX(32px) rotate(-360deg) } }
        @keyframes cv-status-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
        @keyframes cv-border-travel { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
      `}</style>

      {/* Floating particles (JS-driven for magnetic attraction) */}
      {particles.map((p, i) => (
        <div
          key={p.id}
          ref={(el) => { particleRefs.current[i] = el }}
          className="absolute left-0 top-0 rounded-full bg-amber-400 pointer-events-none will-change-transform"
          style={{
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            transition: "opacity 0.3s ease",
          }}
        />
      ))}

      {/* Flying symbols on click */}
      {flyingSymbols.map((s) => (
        <div
          key={s.id}
          className="absolute pointer-events-none text-amber-400 z-20"
          style={{
            left: s.x,
            top: s.y,
            fontSize: s.fontSize,
            ["--fly-x" as string]: `${s.flyX}px`,
            ["--fly-y" as string]: `${s.flyY}px`,
            animation: "cv-symbol-fly 2s ease-out forwards",
          }}
        >
          {s.symbol}
        </div>
      ))}

      {/* Main content with fade-in */}
      <div
        className="flex flex-col items-center gap-3 z-10"
        style={{ animation: "cv-fade-in 0.8s ease-out both" }}
      >
        {/* Hexagon icon area */}
        <div className="relative" style={{ animation: "cv-float 4s ease-in-out infinite" }}>
          {/* Pulse rings */}
          <div
            className="absolute inset-0 rounded-2xl border-2 border-amber-400/30"
            style={{ animation: "cv-pulse-ring 3s ease-out infinite" }}
          />
          <div
            className="absolute inset-0 rounded-2xl border-2 border-amber-400/20"
            style={{ animation: "cv-pulse-ring 3s ease-out 1s infinite" }}
          />
          <div
            className="absolute inset-0 rounded-2xl border-2 border-amber-400/10"
            style={{ animation: "cv-pulse-ring 3s ease-out 2s infinite" }}
          />

          {/* Orbiting dot */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div style={{ animation: "cv-orbit 6s linear infinite" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
            </div>
          </div>

          {/* Icon container with glow */}
          <div
            className="w-14 h-14 rounded-2xl bg-card border border-amber-400/20 flex items-center justify-center relative"
            style={{ animation: "cv-glow 3s ease-in-out infinite" }}
          >
            <div style={{ animation: "cv-hex-bob 4s ease-in-out infinite" }}>
              <IconHexagon size={28} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
            </div>
          </div>
        </div>

        {/* Agent name with shimmer */}
        <div className="text-center">
          <p
            className="text-sm font-semibold bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(90deg, var(--foreground) 0%, var(--foreground) 40%, rgba(251,191,36,0.9) 50%, var(--foreground) 60%, var(--foreground) 100%)",
              backgroundSize: "200% 100%",
              animation: "cv-shimmer 4s ease-in-out infinite",
              WebkitBackgroundClip: "text",
            }}
          >
            {agent.title}
          </p>
          <p className="text-[12px] text-muted-foreground/60 mt-0.5 font-mono">{agent.branch}</p>
        </div>
      </div>

      {/* Info card with animated border */}
      <div
        className="w-full max-w-xs z-10 rounded-xl p-[1px]"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.3), transparent)",
          backgroundSize: "200% 100%",
          animation: "cv-fade-in 0.8s ease-out 0.3s both, cv-border-travel 4s ease-in-out infinite",
        }}
      >
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2">
            <IconGitBranch size={12} className="text-amber-400/60" />
            <span className="text-[11px] text-muted-foreground/60 font-mono">{agent.location}</span>
          </div>
          <div className="px-4 py-3 space-y-2 text-[12px] text-muted-foreground/60">
            <div className="flex items-center justify-between">
              <span>Model</span>
              <span className="font-mono text-foreground/70">{agent.model}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className="text-amber-400 flex items-center gap-1.5">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"
                  style={{ animation: "cv-status-pulse 2s ease-in-out infinite" }}
                />
                Ready
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Typewriter prompt */}
      <p
        className="text-[12px] text-muted-foreground/40 text-center z-10 font-mono"
        style={{ animation: "cv-fade-in 0.8s ease-out 0.6s both" }}
      >
        {typedText}
        <span
          className="inline-block w-[1px] h-[13px] bg-amber-400/60 ml-0.5 align-text-bottom"
          style={{ opacity: showCursor ? 1 : 0 }}
        />
      </p>
    </div>
  )
}

// ── Setup view (shown while worktree is being created) ──────────────────────

interface SetupStep {
  label: string
  icon: string
}

const SETUP_STEPS: SetupStep[] = [
  { label: "Creating branch", icon: "⑂" },
  { label: "Setting up worktree", icon: "⬡" },
  { label: "Scaffolding workspace", icon: "⧉" },
  { label: "Linking dependencies", icon: "⇄" },
  { label: "Initializing environment", icon: "◈" },
]

export function SetupView({ pending }: { pending: { title: string; branch: string; repoName: string; estimatedMs: number } }) {
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [typedTitle, setTypedTitle] = useState("")

  // Typewriter effect for the title
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i <= pending.title.length) {
        setTypedTitle(pending.title.slice(0, i))
        i++
      } else {
        clearInterval(interval)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [pending.title])

  // Distribute steps across ~90% of the estimated duration so the last step
  // only spins briefly rather than hanging for a long time.
  useEffect(() => {
    const total = pending.estimatedMs
    // Use 90% of estimated time for the first N-1 steps, leave 10% buffer
    const budget = total * 0.9
    const stepTime = budget / SETUP_STEPS.length
    const timers: ReturnType<typeof setTimeout>[] = []
    SETUP_STEPS.forEach((_, i) => {
      const showAt = 300 + i * stepTime
      const doneAt = showAt + stepTime * 0.65
      timers.push(setTimeout(() => setVisibleSteps(i + 1), showAt))
      if (i < SETUP_STEPS.length - 1) {
        timers.push(setTimeout(() => setCompletedSteps(i + 1), doneAt))
      }
    })
    return () => timers.forEach(clearTimeout)
  }, [pending.estimatedMs])

  const progress = Math.min(((completedSteps + 0.5) / SETUP_STEPS.length) * 100, 95)

  // Floating particle positions
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: ((i * 41 + 17) % 100),
    y: ((i * 59 + 11) % 100),
    size: 1.5 + (i % 3),
    duration: 2.5 + (i % 4) * 1.1,
    delay: (i % 8) * 0.35,
    opacity: 0.1 + (i % 4) * 0.08,
  }))

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-5 px-8 overflow-hidden bg-background">
      <style>{`
        @keyframes sv-float { 0%, 100% { transform: translateY(0px) rotate(0deg) } 50% { transform: translateY(-8px) rotate(2deg) } }
        @keyframes sv-particle { 0% { transform: translateY(0) scale(1); opacity: var(--p-op) } 50% { transform: translateY(-24px) scale(1.4); opacity: calc(var(--p-op) * 2) } 100% { transform: translateY(0) scale(1); opacity: var(--p-op) } }
        @keyframes sv-fade-up { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes sv-check { from { stroke-dashoffset: 16 } to { stroke-dashoffset: 0 } }
        @keyframes sv-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes sv-progress { from { width: 0% } to { width: var(--sv-progress) } }
        @keyframes sv-glow { 0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.06), 0 0 60px rgba(251,191,36,0.03) } 50% { box-shadow: 0 0 30px rgba(251,191,36,0.15), 0 0 80px rgba(251,191,36,0.08) } }
        @keyframes sv-orbit { from { transform: rotate(0deg) translateX(36px) rotate(0deg) } to { transform: rotate(360deg) translateX(36px) rotate(-360deg) } }
        @keyframes sv-orbit2 { from { transform: rotate(120deg) translateX(28px) rotate(-120deg) } to { transform: rotate(480deg) translateX(28px) rotate(-480deg) } }
        @keyframes sv-hex-assemble { 0% { opacity: 0; transform: scale(0.3) rotate(-180deg) } 50% { opacity: 1; transform: scale(1.1) rotate(10deg) } 100% { opacity: 1; transform: scale(1) rotate(0deg) } }
        @keyframes sv-ring-expand { 0% { transform: scale(0.8); opacity: 0.5 } 100% { transform: scale(2.5); opacity: 0 } }
        @keyframes sv-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes sv-step-in { from { opacity: 0; transform: translateX(-8px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes sv-dots { 0% { content: '' } 25% { content: '.' } 50% { content: '..' } 75% { content: '...' } }
        @keyframes sv-scanner { 0% { top: 0%; opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { top: 100%; opacity: 0 } }
      `}</style>

      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.id % 3 === 0 ? "rgb(251,191,36)" : p.id % 3 === 1 ? "rgb(96,165,250)" : "rgb(167,139,250)",
            ["--p-op" as string]: p.opacity,
            opacity: p.opacity,
            animation: `sv-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}

      {/* Main animated icon */}
      <div
        className="relative z-10"
        style={{ animation: "sv-float 3.5s ease-in-out infinite" }}
      >
        {/* Expanding rings */}
        <div
          className="absolute inset-0 rounded-2xl border-2 border-amber-400/25"
          style={{ animation: "sv-ring-expand 2.5s ease-out infinite" }}
        />
        <div
          className="absolute inset-0 rounded-2xl border-2 border-blue-400/15"
          style={{ animation: "sv-ring-expand 2.5s ease-out 0.8s infinite" }}
        />
        <div
          className="absolute inset-0 rounded-2xl border-2 border-violet-400/10"
          style={{ animation: "sv-ring-expand 2.5s ease-out 1.6s infinite" }}
        />

        {/* Orbiting dots */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ animation: "sv-orbit 4s linear infinite" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ animation: "sv-orbit2 5s linear infinite" }}>
            <div className="w-1 h-1 rounded-full bg-blue-400/50" />
          </div>
        </div>

        {/* Icon container */}
        <div
          className="w-16 h-16 rounded-2xl bg-card border border-amber-400/20 flex items-center justify-center relative overflow-hidden"
          style={{ animation: "sv-glow 2.5s ease-in-out infinite" }}
        >
          {/* Scanner line */}
          <div
            className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent pointer-events-none"
            style={{ animation: "sv-scanner 2s ease-in-out infinite" }}
          />
          <div style={{ animation: "sv-hex-assemble 0.8s ease-out both" }}>
            <IconHexagon size={32} className="text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
          </div>
        </div>
      </div>

      {/* Title area */}
      <div
        className="text-center z-10"
        style={{ animation: "sv-fade-up 0.6s ease-out 0.2s both" }}
      >
        <p
          className="text-sm font-semibold bg-clip-text text-transparent"
          style={{
            backgroundImage: "linear-gradient(90deg, var(--foreground) 0%, var(--foreground) 35%, rgba(251,191,36,0.9) 50%, var(--foreground) 65%, var(--foreground) 100%)",
            backgroundSize: "200% 100%",
            animation: "sv-shimmer 3s ease-in-out infinite",
            WebkitBackgroundClip: "text",
          }}
        >
          {typedTitle}
          <span className="inline-block w-[1px] h-[13px] bg-amber-400/70 ml-0.5 align-text-bottom animate-pulse" />
        </p>
        <p className="text-[11px] text-muted-foreground/50 mt-1 font-mono">{pending.branch}</p>
      </div>

      {/* Terminal-style step list */}
      <div
        className="w-full max-w-xs z-10 rounded-xl overflow-hidden border border-border/60 bg-card/80 backdrop-blur-sm"
        style={{ animation: "sv-fade-up 0.6s ease-out 0.5s both" }}
      >
        {/* Terminal header */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 bg-secondary/40">
          <div className="w-2 h-2 rounded-full bg-red-400/40" />
          <div className="w-2 h-2 rounded-full bg-yellow-400/40" />
          <div className="w-2 h-2 rounded-full bg-green-400/40" />
          <span className="text-[9px] text-muted-foreground/40 font-mono ml-1.5">{pending.repoName}</span>
        </div>

        {/* Steps */}
        <div className="px-3 py-2.5 space-y-1.5">
          {SETUP_STEPS.slice(0, visibleSteps).map((step, i) => {
            const isDone = i < completedSteps
            const isCurrent = i === visibleSteps - 1 && !isDone
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] font-mono"
                style={{ animation: "sv-step-in 0.3s ease-out both" }}
              >
                <span className="text-muted-foreground/40 shrink-0">{step.icon}</span>
                <span className={cn(
                  "flex-1 transition-colors duration-300",
                  isDone ? "text-muted-foreground/40" : isCurrent ? "text-amber-400/90" : "text-foreground/70"
                )}>
                  {step.label}
                </span>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-emerald-400">
                    <path
                      d="M3 6.5L5 8.5L9 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="16"
                      style={{ animation: "sv-check 0.3s ease-out both" }}
                    />
                  </svg>
                ) : isCurrent ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-amber-400" style={{ animation: "sv-spin 1s linear infinite" }}>
                    <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 15" strokeLinecap="round" />
                  </svg>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="px-3 pb-2.5">
          <div className="h-[3px] rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400/80 via-amber-400 to-yellow-300"
              style={{
                ["--sv-progress" as string]: `${progress}%`,
                width: `${progress}%`,
                transition: "width 0.6s ease-out",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Teardown view (shown while worktree is being deleted) ───────────────────

const TEARDOWN_STEPS = [
  { label: "Stopping processes", icon: "◼" },
  { label: "Removing worktree", icon: "⑂" },
  { label: "Cleaning up", icon: "✕" },
]

export function TeardownView({ deleting }: { deleting: { title: string; branch: string; repoName: string } }) {
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [shrink, setShrink] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    TEARDOWN_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleSteps(i + 1), 100 + i * 350))
      timers.push(setTimeout(() => setCompletedSteps(i + 1), 100 + i * 350 + 250))
    })
    timers.push(setTimeout(() => setShrink(true), 1200))
    return () => timers.forEach(clearTimeout)
  }, [])

  const particles = Array.from({ length: 14 }, (_, i) => {
    // Golden-ratio-based scatter for even distribution
    const phi = 1.618033988749
    const theta = i * phi * Math.PI * 2
    const r = 0.25 + (i / 14) * 0.55
    return {
      id: i,
      x: 50 + Math.cos(theta) * r * 45,
      y: 50 + Math.sin(theta) * r * 40,
      size: 1.5 + (i % 4),
      delay: (i * 0.11) % 0.9,
    }
  })

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-4 px-8 overflow-hidden bg-background">
      <style>{`
        @keyframes td-fade-up { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes td-check { from { stroke-dashoffset: 16 } to { stroke-dashoffset: 0 } }
        @keyframes td-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes td-scatter { 0% { transform: translate(0,0) scale(1); opacity: 0.6 } 100% { transform: translate(var(--td-dx), var(--td-dy)) scale(0); opacity: 0 } }
        @keyframes td-shrink { 0% { transform: scale(1); opacity: 1 } 100% { transform: scale(0.5); opacity: 0 } }
        @keyframes td-ring-collapse { 0% { transform: scale(1); opacity: 0.3 } 100% { transform: scale(0.3); opacity: 0 } }
      `}</style>

      {/* Scattering particles — fly outward from their position toward the edges */}
      {particles.map((p) => {
        const angle = Math.atan2(p.y - 50, p.x - 50)
        const dist = 40 + (p.id % 5) * 12
        return (
          <div
            key={p.id}
            className="absolute rounded-full bg-red-400 pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              ["--td-dx" as string]: `${Math.cos(angle) * dist}px`,
              ["--td-dy" as string]: `${Math.sin(angle) * dist}px`,
              animation: `td-scatter 1.2s ease-out ${p.delay}s both`,
            }}
          />
        )
      })}

      {/* Collapsing icon */}
      <div
        className="relative z-10"
        style={shrink ? { animation: "td-shrink 0.4s ease-in both" } : undefined}
      >
        <div
          className="absolute inset-0 rounded-2xl border-2 border-red-400/20"
          style={{ animation: "td-ring-collapse 0.8s ease-in 0.3s both" }}
        />
        <div className="w-14 h-14 rounded-2xl bg-card border border-red-400/20 flex items-center justify-center">
          <IconHexagon size={28} className="text-red-400/70 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]" />
        </div>
      </div>

      {/* Title */}
      <div
        className="text-center z-10"
        style={shrink ? { animation: "td-shrink 0.4s ease-in 0.05s both" } : { animation: "td-fade-up 0.3s ease-out both" }}
      >
        <p className="text-sm font-semibold text-muted-foreground/70">{deleting.title}</p>
        <p className="text-[11px] text-muted-foreground/40 mt-0.5 font-mono">{deleting.branch}</p>
      </div>

      {/* Quick step list */}
      <div
        className="w-full max-w-xs z-10 rounded-xl overflow-hidden border border-border/40 bg-card/60"
        style={shrink ? { animation: "td-shrink 0.4s ease-in 0.1s both" } : { animation: "td-fade-up 0.3s ease-out 0.1s both" }}
      >
        <div className="px-3 py-2 space-y-1">
          {TEARDOWN_STEPS.slice(0, visibleSteps).map((step, i) => {
            const isDone = i < completedSteps
            const isCurrent = i === visibleSteps - 1 && !isDone
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] font-mono"
                style={{ animation: "td-fade-up 0.15s ease-out both" }}
              >
                <span className="text-red-400/50 shrink-0">{step.icon}</span>
                <span className={cn(
                  "flex-1 transition-colors duration-200",
                  isDone ? "text-muted-foreground/30" : isCurrent ? "text-red-400/80" : "text-foreground/60"
                )}>
                  {step.label}
                </span>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-muted-foreground/40">
                    <path
                      d="M3 6.5L5 8.5L9 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="16"
                      style={{ animation: "td-check 0.2s ease-out both" }}
                    />
                  </svg>
                ) : isCurrent ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-red-400/60" style={{ animation: "td-spin 0.8s linear infinite" }}>
                    <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 15" strokeLinecap="round" />
                  </svg>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Context ring ─────────────────────────────────────────────────────────────

const CLAUDE_CONTEXT_TOKENS = 200_000

function ContextRing({ messages }: { messages: Message[] }) {
  // Find the latest assistant message with inputTokens
  const latest = [...messages].reverse().find((m) => m.role === "assistant" && m.inputTokens != null)
  const tokens = latest?.inputTokens ?? 0
  const pct = Math.min(tokens / CLAUDE_CONTEXT_TOKENS, 1)
  const alwaysShow = getAlwaysContext()

  if (tokens === 0 || (!alwaysShow && pct < 0.7)) return null

  const size = 20
  const r = 7
  const circ = 2 * Math.PI * r
  const dash = pct * circ
  const color = pct >= 0.9 ? "#f87171" : pct >= 0.7 ? "#facc15" : "#60a5fa"

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      title={`Context: ${Math.round(pct * 100)}% used (${tokens.toLocaleString()} / ${CLAUDE_CONTEXT_TOKENS.toLocaleString()} tokens)`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/20" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
      </svg>
      <span className="absolute text-[7px] font-medium" style={{ color }}>
        {Math.round(pct * 100)}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type OpenFile = { type: "diff"; file: FileChange } | { type: "content"; path: string }

interface ChatTab {
  agentId: string
  title: string
}

interface ChatViewProps {
  agent: Agent
  isStreaming: boolean
  loadMore?: () => Promise<void>
  hasMore?: boolean
  isLoadingMore?: boolean
  openFileTab: OpenFile | null
  onClearFileTab: () => void
  tabs?: ChatTab[]
  activeTabId?: string | null
  onTabSelect?: (agentId: string) => void
  onTabClose?: (agentId: string) => void
  onNewTab?: () => void
  onTabTitleChange?: (agentId: string, title: string) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
  onClearComments?: () => void
  githubEnabled?: boolean
  pendingQuestion?: {
    toolUseId: string
    questions: Array<{ question: string; header?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }>
  } | null
  onClearPendingQuestion?: () => void
  /** Hide the header bar and tab bar — used for embedded views like task refinement */
  hideChrome?: boolean
}

export function ChatView({ agent, isStreaming, loadMore, hasMore = false, isLoadingMore = false, openFileTab, onClearFileTab, tabs = [], activeTabId, onTabSelect, onTabClose, onNewTab, onTabTitleChange, pendingComments = [], onRemoveComment, onClearComments, githubEnabled = false, pendingQuestion = null, onClearPendingQuestion, hideChrome = false }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Callback ref: attaches the scroll listener as soon as the element mounts
  // (useEffect with [] misses it when the element is initially absent)
  const setScrollContainer = useCallback((el: HTMLDivElement | null) => {
    const prev = scrollContainerRef.current
    if (prev) {
      const handler = (prev as HTMLDivElement & { _scrollHandler?: () => void })._scrollHandler
      if (handler) prev.removeEventListener("scroll", handler)
    }
    ;(scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    if (el) {
      const onScroll = () => {
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight
        setIsAtBottom(dist < 80)
      }
      ;(el as HTMLDivElement & { _scrollHandler?: () => void })._scrollHandler = onScroll
      el.addEventListener("scroll", onScroll, { passive: true })
    }
  }, [])
  const queryClient = useQueryClient()
  const [input, setInput] = useState(agent.draft ?? "")
  const agentIdRef = useRef(agent.id)
  agentIdRef.current = agent.id
  const inputRef = useRef(input)
  inputRef.current = input
  const prevAgentIdRef = useRef<string | null>(null)
  const [activeTab, setActiveTab] = useState<"chat" | "file">("chat")
  const [effort, setEffort] = useState<"" | "low" | "medium" | "high" | "max">("")
  const [isSending, setIsSending] = useState(false)
  const [messageQueue, setMessageQueue] = useState<Array<{ id: string; agentId: string; display: string; api: string; planMode?: boolean }>>([])
  const [planMode, setPlanMode] = useState(false)
  const [awaitingPlanApproval, setAwaitingPlanApproval] = useState(false)
  const planModeCache = useRef(new Map<string, boolean>())
  const planApprovalCache = useRef(new Map<string, boolean>())
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [baseBranchOpen, setBaseBranchOpen] = useState(false)
  const [baseBranchSearch, setBaseBranchSearch] = useState("")
  const baseBranchSearchRef = useRef<HTMLInputElement>(null)
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState("")
  const branchSearchRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<{ name: string; path: string; mimeType: string }[]>([])
  const attachmentsCache = useRef(new Map<string, { name: string; path: string; mimeType: string }[]>())
  const [linkedAgents, setLinkedAgents] = useState<AgentSummary[]>([])
  const linkedAgentsCache = useRef(new Map<string, AgentSummary[]>())
  const [plusOpen, setPlusOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const [agentPickerSearch, setAgentPickerSearch] = useState("")
  const [lastOpenInApp, setLastOpenInApp] = useState(() => localStorage.getItem(OPEN_IN_KEY) ?? "finder")
  const [openInOpen, setOpenInOpen] = useState(false)
  const remoteMode = getFlag("remoteEditor") && isTauri && isRemoteServer()
  const [detectedEditors, setDetectedEditors] = useState<string[]>([])
  const [sshInfo, setSshInfo] = useState<{ host: string; port: number; user: string; configured: boolean } | null>(null)
  const [showSshSetup, setShowSshSetup] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: allAgents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const repoName = repos.find((r) => r.id === agent.repoId)?.name
  const { data: repoBranches = [] } = useQuery({
    queryKey: ["repo-branches", agent.repoId],
    queryFn: () => api.getRepoBranches(agent.repoId!),
    enabled: !!agent.repoId && (baseBranchOpen || branchPickerOpen),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])

  // Load SSH info + detect local editors when in remote mode
  useEffect(() => {
    if (!remoteMode) return
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string[]>("detect_editors").then(setDetectedEditors).catch(() => {})
    })
    api.getSystemSshInfo().then(setSshInfo).catch(() => {})
  }, [remoteMode])

  // "Open in" keyboard shortcut: Cmd/Ctrl+O reopens last-used app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "o" && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        void doOpenIn(lastOpenInApp)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [agent.id, lastOpenInApp, remoteMode, sshInfo])

  async function doOpenIn(appKey: string) {
    if (remoteMode && sshInfo) {
      try {
        const res = await api.getWorktreePath(agent.id)
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_ssh_editor", {
          editor: appKey,
          user: sshInfo.user,
          host: sshInfo.host,
          port: sshInfo.port,
          path: res.path,
        })
      } catch (err) {
        toast.error(String(err))
      }
    } else {
      void api.openIn(agent.id, appKey)
    }
  }

  function handleOpenIn(appKey: string) {
    localStorage.setItem(OPEN_IN_KEY, appKey)
    setLastOpenInApp(appKey)
    void doOpenIn(appKey)
  }


  async function commitTitle() {
    const title = titleDraft.trim()
    setEditingTitle(false)
    if (!title || title === agent.title) return
    await api.updateAgent(agent.id, { title })
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, title } : old)
    queryClient.invalidateQueries({ queryKey: ["agents"] })
    onTabTitleChange?.(agent.id, title)
  }

  async function selectBaseBranch(val: string) {
    setBaseBranchOpen(false)
    setBaseBranchSearch("")
    if (!val || val === agent.baseBranch) return
    await api.updateAgent(agent.id, { baseBranch: val })
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, baseBranch: val } : old)
  }

  async function selectBranch(val: string, force = false) {
    setBranchPickerOpen(false)
    setBranchSearch("")
    if (!val || val === agent.branch) return
    try {
      const updated = await api.switchBranch(agent.id, val, force || undefined)
      queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, ...updated } : old)
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch (err: any) {
      if (err?.message?.includes("already checked out")) {
        toast.error(`Branch "${val}" is locked to a stale worktree`, {
          action: { label: "Force remove & retry", onClick: () => void selectBranch(val, true) },
          duration: 8000,
        })
      } else {
        toast.error(err?.message ?? "Failed to switch branch")
      }
    }
  }
  const [slashQuery, setSlashQuery] = useState<string | null>(null) // null = closed, "" = show all
  const [slashIndex, setSlashIndex] = useState(0)

  // @ mention state
  type MentionAttachment = { type: "file"; path: string; name: string } | { type: "terminal" }
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionAttachments, setMentionAttachments] = useState<MentionAttachment[]>([])
  const mentionStartRef = useRef<number>(0)
  const mentionListRef = useRef<HTMLDivElement>(null)
  const mentionActiveRef = useRef<HTMLDivElement>(null)

  // Scroll active mention row into view when navigating with keyboard
  useEffect(() => {
    mentionActiveRef.current?.scrollIntoView({ block: "nearest" })
  }, [mentionIndex])

  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: api.getProviders,
    staleTime: 60_000,
  })

  // Build a flat model list from providers, falling back to hardcoded Claude models
  const allModels = useMemo(() => {
    if (providers.length === 0) return FALLBACK_MODELS
    return providers
      .filter((p) => p.available)
      .flatMap((p) => p.models.map((m) => ({ id: m.api || m.id, label: m.label, provider: p.id })))
  }, [providers])

  // Current provider's capabilities
  const currentProvider = providers.find((p) => p.id === (agent.provider ?? "claude"))
  const capabilities = currentProvider?.capabilities ?? {}

  async function handleModelChange(value: string) {
    // value is "provider:model" format
    const [providerId, ...modelParts] = value.split(":")
    const modelId = modelParts.join(":")
    const updates: Record<string, string> = { model: modelId }
    if (providerId !== (agent.provider ?? "claude")) updates.provider = providerId
    await api.updateAgent(agent.id, updates as Parameters<typeof api.updateAgent>[1])
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, ...updates } : old)
  }

  const { data: filteredCommands = [] } = useQuery({
    queryKey: ["slash-commands", agent.id, slashQuery],
    queryFn: () => api.getSlashCommands(agent.id, slashQuery ?? undefined),
    enabled: slashQuery !== null,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: fileTree = [] } = useQuery({
    queryKey: ["file-tree", agent.id],
    queryFn: () => api.getFileTree(agent.id),
    enabled: mentionQuery !== null,
    staleTime: 30_000,
  })

  const mentionOptions = useMemo(() => {
    function flattenTree(nodes: typeof fileTree): { name: string; path: string }[] {
      const result: { name: string; path: string }[] = []
      for (const node of nodes) {
        if (node.type === "file") result.push({ name: node.name, path: node.path })
        if (node.children) result.push(...flattenTree(node.children as typeof fileTree))
      }
      return result
    }
    const q = mentionQuery ?? ""
    const files = flattenTree(fileTree)
    const filtered = q === ""
      ? files.slice(0, 20)
      : files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
    return [
      { type: "terminal" as const, name: "Terminal output", path: "" },
      ...filtered.map((f) => ({ type: "file" as const, name: f.name, path: f.path })),
    ]
  }, [fileTree, mentionQuery])

  function handleInputChange(value: string) {
    setInput(value)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
    const lastLine = value.split("\n").pop() ?? ""
    // Slash commands
    if (lastLine.startsWith("/")) {
      setSlashQuery(lastLine.slice(1))
      setSlashIndex(0)
    } else {
      setSlashQuery(null)
    }
    // @ mentions: detect last @ preceded by start or whitespace
    const atMatch = lastLine.match(/(^|[\s])@(\S*)$/)
    if (atMatch) {
      const query = atMatch[2]
      mentionStartRef.current = value.lastIndexOf("@" + query)
      setMentionQuery(query)
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  const applySlashCommand = useCallback((name: string) => {
    // Replace the trailing "/..." with the full command
    setInput((prev) => {
      const lines = prev.split("\n")
      lines[lines.length - 1] = `/${name} `
      return lines.join("\n")
    })
    setSlashQuery(null)
  }, [])

  const applyMention = useCallback((option: { type: "file"; path: string; name: string } | { type: "terminal"; name: string; path: string }) => {
    if (option.type === "file") {
      // Use only the basename for display so the mention reads @index.html not @apps/desktop/index.html
      const displayName = option.name.split("/").pop() ?? option.name
      setInput((prev) => {
        const start = mentionStartRef.current
        const end = start + 1 + (mentionQuery?.length ?? 0)
        return prev.slice(0, start) + "@" + displayName + " " + prev.slice(end)
      })
      setMentionAttachments((prev) => {
        if (prev.some((x) => x.type === "file" && x.path === option.path)) return prev
        return [...prev, { type: "file" as const, path: option.path, name: displayName }]
      })
    } else {
      // Terminal: remove @query from textarea, add as chip
      setInput((prev) => {
        const start = mentionStartRef.current
        const end = start + 1 + (mentionQuery?.length ?? 0)
        return prev.slice(0, start) + prev.slice(end)
      })
      setMentionAttachments((prev) => {
        if (prev.some((x) => x.type === "terminal")) return prev
        return [...prev, { type: "terminal" as const }]
      })
    }
    setMentionQuery(null)
  }, [mentionQuery])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const result = await api.uploadFile(agent.id, file.name, reader.result as string, file.type)
          setAttachments((prev) => [...prev, result])
        } catch {
          toast.error(`Failed to upload ${file.name}`)
        }
      }
      reader.readAsDataURL(file)
    }
    setPlusOpen(false)
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const result = await api.uploadFile(agent.id, file.name, reader.result as string, file.type)
          setAttachments((prev) => [...prev, result])
        } catch {
          toast.error(`Failed to upload ${file.name}`)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if leaving the container (not entering a child)
    const rect = e.currentTarget.getBoundingClientRect()
    const { clientX: x, clientY: y } = e
    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDragOver(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      uploadFiles(files)
    }
  }

  function toggleLinkedAgent(a: AgentSummary) {
    setLinkedAgents((prev) =>
      prev.some((x) => x.id === a.id) ? prev.filter((x) => x.id !== a.id) : [...prev, a]
    )
  }

  async function buildContent(text: string) {
    let content = text

    if (pendingComments.length > 0) {
      const commentContext = pendingComments.map((c) => {
        const loc = c.path ? `${c.path.split("/").pop()}${c.line ? `:${c.line}` : ""}` : null
        return `@${c.author}${loc ? ` on \`${loc}\`` : ""}:\n> ${c.body.trim().replace(/\n/g, "\n> ")}`
      }).join("\n\n")
      content = `PR review comments:\n\n${commentContext}\n\n---\n\n${content}`
    }

    if (attachments.length > 0) {
      const fileBlock = attachments.map((f) => `- ${f.name}: ${f.path}`).join("\n")
      content = `Attached files:\n${fileBlock}\n\n---\n\n${content}`
    }

    // Replace @name mentions inline with their full paths
    const fileMentions = mentionAttachments.filter((m): m is { type: "file"; path: string; name: string } => m.type === "file")
    for (const mention of fileMentions) {
      content = content.replaceAll(`@${mention.name}`, mention.path)
    }

    // Terminal attachment (from chip)
    if (mentionAttachments.some((ma) => ma.type === "terminal")) {
      const lines = await api.getTerminal(agent.id).catch(() => [] as string[])
      const termBlock = `<terminal>\n${lines.slice(-100).join("\n")}\n</terminal>`
      content = termBlock + "\n\n---\n\n" + content
    }

    if (linkedAgents.length > 0) {
      const agentBlock = linkedAgents.map((a) =>
        `- "${a.title}" (${a.branch}) — ID: ${a.id}`
      ).join("\n")
      content = `${content}\n\n---\n\nLinked workspaces (separate agents in other repos):\n${agentBlock}\n\nTo delegate a task to a linked workspace, emit this tag in your response (do NOT use SendMessage — it is for sub-agents, not linked workspaces):\n  <huxflux:delegate agent="<AGENT_ID>">task description</huxflux:delegate>`
    }

    return content
  }

  async function sendContent(displayText: string, apiContent: string, opts?: { planMode?: boolean; effort?: string }) {
    setIsSending(true)
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: displayText,
      timestamp: new Date().toISOString(),
    }
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => {
      if (!old) return old
      return { ...old, messages: [...old.messages, optimisticMsg] }
    })
    try {
      await api.sendMessage(agent.id, apiContent, opts)
    } catch {
      queryClient.setQueryData<Agent>(["agent", agent.id], (old) => {
        if (!old) return old
        return { ...old, messages: old.messages.filter((m) => m.id !== optimisticMsg.id) }
      })
    } finally {
      setIsSending(false)
    }
  }

  function handleSend() {
    const text = input.trim()
    if ((!text && pendingComments.length === 0 && attachments.length === 0) || isSending) return

    const isPlan = planMode
    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    void api.updateAgent(agent.id, { draft: "" })
    onClearComments?.()
    setAttachments([])
    setMentionAttachments([])

    if (isPlan) setAwaitingPlanApproval(true)

    void (async () => {
      const apiContent = await buildContent(text)
      if (isStreaming) {
        setMessageQueue((prev) => [...prev, { id: `q-${Date.now()}`, agentId: agent.id, display: text, api: apiContent, planMode: isPlan || undefined }])
        return
      }
      const sendOpts: { planMode?: boolean; effort?: string } = {}
      if (isPlan) sendOpts.planMode = true
      if (effort) sendOpts.effort = effort
      void sendContent(text, apiContent, Object.keys(sendOpts).length > 0 ? sendOpts : undefined)
    })()
  }

  function handlePlanApprove() {
    setAwaitingPlanApproval(false)
    setPlanMode(false)
    void sendContent("Plan approved", "Plan approved — execute it now.")
  }

  function handlePlanDismiss() {
    setAwaitingPlanApproval(false)
  }

  async function handleAnswerQuestion(answers: Record<string, string>) {
    try {
      await api.answerQuestion(agent.id, answers)
    } catch { /* non-fatal */ }
    onClearPendingQuestion?.()
  }

  // Drain first queued message for the current agent when it stops streaming
  useEffect(() => {
    if (isStreaming) return
    const idx = messageQueue.findIndex((m) => m.agentId === agent.id)
    if (idx === -1) return
    const next = messageQueue[idx]
    setMessageQueue((prev) => prev.filter((_, i) => i !== idx))
    void sendContent(next.display, next.api, next.planMode ? { planMode: true } : undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, agent.id])

  useEffect(() => {
    if (openFileTab) setActiveTab("file")
  }, [openFileTab])

  // Debounce-save draft on any input change (catches slash/mention completions too)
  useEffect(() => {
    const agentId = agentIdRef.current
    const timer = setTimeout(() => {
      void api.updateAgent(agentId, { draft: input })
    }, 500)
    return () => clearTimeout(timer)
  }, [input])

  useEffect(() => {
    // Flush the outgoing agent's draft immediately before switching
    const prevId = prevAgentIdRef.current
    if (prevId && prevId !== agent.id) {
      void api.updateAgent(prevId, { draft: inputRef.current })
    }
    // Save per-agent state for the outgoing agent
    if (prevId) {
      linkedAgentsCache.current.set(prevId, linkedAgents)
      planModeCache.current.set(prevId, planMode)
      planApprovalCache.current.set(prevId, awaitingPlanApproval)
      attachmentsCache.current.set(prevId, attachments)
    }
    prevAgentIdRef.current = agent.id
    setActiveTab("chat")
    setIsAtBottom(true)
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
    setInput(agent.draft ?? "")
    // Restore per-agent state for the incoming agent
    setLinkedAgents(linkedAgentsCache.current.get(agent.id) ?? [])
    setPlanMode(planModeCache.current.get(agent.id) ?? false)
    setAwaitingPlanApproval(planApprovalCache.current.get(agent.id) ?? false)
    setAttachments(attachmentsCache.current.get(agent.id) ?? [])
  }, [agent.id])

  // Auto-scroll to bottom when streaming, but only if the user is already at the bottom
  const lastMessage = agent.messages[agent.messages.length - 1]
  const streamingContentLen = lastMessage?.content?.length ?? 0
  const streamingToolCallsLen = lastMessage?.toolCalls?.length ?? 0
  useEffect(() => {
    if (isStreaming && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [isStreaming, isAtBottom, agent.messages.length, streamingContentLen, streamingToolCallsLen])

  const closeFileTab = () => {
    setActiveTab("chat")
    onClearFileTab()
  }

  // Single source of truth — derived from server's streaming flag + last
  // message's durationMs. See packages/shared/src/agentState.ts.
  const uiIsStreaming = isAgentStreaming(agent)

  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const streamingStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (uiIsStreaming) {
      if (streamingStartRef.current === null) {
        streamingStartRef.current = Date.now()
        setElapsedSeconds(0)
      }
      const id = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - streamingStartRef.current!) / 1000))
      }, 1000)
      return () => clearInterval(id)
    } else {
      streamingStartRef.current = null
      setElapsedSeconds(0)
    }
  }, [uiIsStreaming])

  const hasInput = input.trim().length > 0 || pendingComments.length > 0 || attachments.length > 0
  const canSend = hasInput && !isSending

  // Detect plan mode from tool calls in the latest messages
  const lastAssistantMsg = [...agent.messages].reverse().find((m) => m.role === "assistant")
  const hasExitPlanMode = lastAssistantMsg?.toolCalls?.some((tc) => tc.tool === "ExitPlanMode") ?? false
  // Check if Claude entered plan mode (in any recent message) and hasn't exited yet
  const claudeInPlanMode = (() => {
    for (let i = agent.messages.length - 1; i >= 0; i--) {
      const tcs = agent.messages[i].toolCalls ?? []
      if (tcs.some((tc) => tc.tool === "ExitPlanMode")) return false
      if (tcs.some((tc) => tc.tool === "EnterPlanMode")) return true
    }
    return false
  })()

  // Show approve/dismiss when:
  // 1. User-initiated: awaitingPlanApproval flag is set, OR
  // 2. Claude-initiated: last assistant message has ExitPlanMode
  // Streaming must be done and the message must have content (the plan).
  const showPlanApproval = !isStreaming && !!lastAssistantMsg?.content && (awaitingPlanApproval || hasExitPlanMode)
  // Show plan mode indicator when Claude is actively planning (entered but not exited)
  const isInPlanMode = planMode || claudeInPlanMode

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Top metadata bar */}
      {!hideChrome && <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        {repoName && (
          <>
            <span className="text-[12px] text-muted-foreground/50 font-medium truncate shrink-0 max-w-[120px]">{repoName}</span>
            <span className="text-muted-foreground/30 shrink-0">/</span>
          </>
        )}
        <IconGitBranch size={13} className="text-muted-foreground/50 shrink-0" />
        <Popover open={branchPickerOpen} onOpenChange={(o) => { setBranchPickerOpen(o); if (o) setBranchSearch("") }}>
          <PopoverTrigger asChild>
            <button
              className="text-[12px] text-muted-foreground font-mono hover:text-foreground transition-colors flex items-center gap-1 truncate max-w-[200px]"
              title="Click to change branch"
            >
              {agent.branch}
              <IconChevronDown size={11} className="opacity-50 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" align="start">
            <input
              ref={branchSearchRef}
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setBranchPickerOpen(false)
                if (e.key === "Enter") {
                  const filtered = repoBranches.filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()))
                  if (filtered.length === 1) void selectBranch(filtered[0])
                  else if (branchSearch.trim()) void selectBranch(branchSearch.trim())
                }
              }}
              placeholder="Search branches…"
              autoFocus
              className="w-full bg-transparent border-b border-border px-2 py-1.5 text-[12px] font-mono outline-none placeholder:text-muted-foreground/50 mb-1"
            />
            <div className="max-h-48 overflow-y-auto">
              {repoBranches
                .filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()))
                .map((b) => (
                  <button
                    key={b}
                    onClick={() => void selectBranch(b)}
                    className={cn(
                      "w-full text-left px-2 py-1 text-[12px] font-mono rounded hover:bg-accent transition-colors",
                      b === agent.branch && "text-foreground font-medium"
                    )}
                  >
                    {b}
                  </button>
                ))}
              {repoBranches.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Loading branches…</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground/30 shrink-0">›</span>
        <Popover open={baseBranchOpen} onOpenChange={(o) => { setBaseBranchOpen(o); if (o) setBaseBranchSearch("") }}>
          <PopoverTrigger asChild>
            <button
              className="text-[12px] text-muted-foreground/60 font-mono hover:text-foreground transition-colors flex items-center gap-1"
              title="Click to change base branch"
            >
              {agent.baseBranch ?? "origin/main"}
              <IconChevronDown size={11} className="opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            <input
              ref={baseBranchSearchRef}
              value={baseBranchSearch}
              onChange={(e) => setBaseBranchSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setBaseBranchOpen(false)
                if (e.key === "Enter") {
                  const filtered = repoBranches.filter((b) => b.toLowerCase().includes(baseBranchSearch.toLowerCase()))
                  if (filtered.length === 1) void selectBaseBranch(filtered[0])
                  else if (baseBranchSearch.trim()) void selectBaseBranch(baseBranchSearch.trim())
                }
              }}
              placeholder="Search branches…"
              autoFocus
              className="w-full bg-transparent border-b border-border px-2 py-1.5 text-[12px] font-mono outline-none placeholder:text-muted-foreground/50 mb-1"
            />
            <div className="max-h-48 overflow-y-auto">
              {repoBranches
                .filter((b) => b.toLowerCase().includes(baseBranchSearch.toLowerCase()))
                .map((branch) => (
                  <button
                    key={branch}
                    onClick={() => void selectBaseBranch(branch)}
                    className={cn(
                      "w-full text-left px-2 py-1 text-[12px] font-mono rounded hover:bg-accent transition-colors",
                      branch === (agent.baseBranch ?? "origin/main") && "text-foreground font-medium"
                    )}
                  >
                    {branch}
                  </button>
                ))}
              {repoBranches.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Loading branches…</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {githubEnabled && agent.prStatus && (
            <PRStatusPill prStatus={agent.prStatus} agentId={agent.id} />
          )}
          {githubEnabled && !agent.prStatus && !isStreaming && agent.messages.length > 0 && (
            <button
              onClick={() => { const msg = "Please create a pull request for the changes you've made. Write a clear title and description."; sendContent(msg, msg) }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border hover:bg-accent transition-colors text-[11px] text-muted-foreground"
            >
              Create PR
            </button>
          )}
          <Popover open={openInOpen} onOpenChange={setOpenInOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border hover:bg-accent transition-colors">
                {(() => {
                  const LastIcon = OPEN_IN_APPS.find((a) => a.key === lastOpenInApp)?.Icon ?? IconFolder
                  return <LastIcon size={12} className="text-muted-foreground/60" />
                })()}
                <span className="text-[11px] text-muted-foreground font-mono">/{agent.location}</span>
                <IconChevronDown size={10} className="text-muted-foreground/50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1" sideOffset={4}>
              {remoteMode && sshInfo && !sshInfo.configured && (
                <div className="flex items-center justify-between px-2 py-1.5 mb-1 text-[11px] text-amber-400 bg-amber-400/10 rounded">
                  <span>SSH not configured</span>
                  <button
                    onClick={() => { setOpenInOpen(false); setShowSshSetup(true) }}
                    className="underline ml-1"
                  >
                    Setup
                  </button>
                </div>
              )}
              {(remoteMode
                ? OPEN_IN_APPS.filter((a) => SSH_CAPABLE_EDITORS.includes(a.key) && detectedEditors.includes(a.key))
                : OPEN_IN_APPS
              ).map((item) => (
                <button
                  key={item.key}
                  onClick={() => { handleOpenIn(item.key); setOpenInOpen(false) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
                >
                  <item.Icon size={14} className="text-muted-foreground" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {!remoteMode && <span className="text-[10px] text-muted-foreground/40">{item.shortcut}</span>}
                </button>
              ))}
              {remoteMode && detectedEditors.length === 0 && (
                <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
                  No SSH-capable editors found.<br />Install VS Code or Cursor.
                </div>
              )}
              <div className="border-t border-border my-1" />
              <button
                onClick={async () => {
                  setOpenInOpen(false)
                  const res = await api.getWorktreePath(agent.id)
                  await navigator.clipboard.writeText(res.path)
                  toast.success("Path copied")
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
              >
                <IconClipboard size={14} className="text-muted-foreground" />
                <span className="flex-1 text-left">Copy path</span>
                {!remoteMode && <span className="text-[10px] text-muted-foreground/40">⌘⇧C</span>}
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>}

      {/* Tab bar */}
      {!hideChrome && <div className="flex items-center border-b border-border shrink-0 px-2 overflow-x-auto">
        {tabs.length > 1 ? (
          // Multi-tab mode: show each agent as a tab
          tabs.map((tab) => {
            const isActive = tab.agentId === activeTabId && activeTab === "chat"
            const isEditingThis = editingTitle && tab.agentId === activeTabId
            return (
              <div
                key={tab.agentId}
                onClick={() => { onTabSelect?.(tab.agentId); setActiveTab("chat") }}
                className={cn(
                  "group flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px cursor-pointer shrink-0",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <IconSparkles size={12} className="shrink-0" />
                {isEditingThis ? (
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void commitTitle() }
                      if (e.key === "Escape") setEditingTitle(false)
                    }}
                    onBlur={() => void commitTitle()}
                    className="bg-background border border-ring rounded px-1.5 py-0.5 outline-none text-foreground w-40"
                  />
                ) : (
                  <span>{tab.title.length > 24 ? tab.title.slice(0, 24) + "…" : tab.title}</span>
                )}
                {isActive && !isEditingThis && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setTitleDraft(tab.title)
                      setEditingTitle(true)
                      onTabTitleChange?.(tab.agentId, tab.title)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground transition-all"
                  >
                    <IconPencil size={11} />
                  </button>
                )}
                {tabs.length > 1 && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); onTabClose?.(tab.agentId) }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-foreground transition-all"
                  >
                    <IconX size={11} />
                  </span>
                )}
              </div>
            )
          })
        ) : (
          // Single tab mode: show agent title with edit
          <div
            onClick={() => setActiveTab("chat")}
            className={cn(
              "group flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px cursor-pointer",
              activeTab === "chat"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <IconSparkles size={12} className="shrink-0" />
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void commitTitle() }
                  if (e.key === "Escape") setEditingTitle(false)
                }}
                onBlur={() => void commitTitle()}
                className="bg-background border border-ring rounded px-1.5 py-0.5 outline-none text-foreground w-48"
              />
            ) : (
              <span>{agent.title.length > 32 ? agent.title.slice(0, 32) + "…" : agent.title}</span>
            )}
            {!editingTitle && (
              <button
                onClick={(e) => { e.stopPropagation(); setTitleDraft(agent.title); setEditingTitle(true) }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground transition-all ml-1"
              >
                <IconPencil size={11} />
              </button>
            )}
          </div>
        )}

        {openFileTab && (
          <button
            onClick={() => setActiveTab("file")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px shrink-0",
              activeTab === "file"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <IconFileCode size={12} />
            <span>{(openFileTab.type === "diff" ? openFileTab.file.path : openFileTab.path).split("/").pop()}</span>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); closeFileTab() }}
              className="ml-1 text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <IconX size={11} />
            </span>
          </button>
        )}

        <button
          onClick={onNewTab}
          className="ml-1 p-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
          title="New agent in same worktree"
        >
          <IconPlus size={13} />
        </button>
      </div>}

      {/* Content */}
      {activeTab === "file" && openFileTab ? (
        <div className="flex-1 min-h-0">
          {openFileTab.type === "diff" ? (
            <DiffView agentId={agent.id} file={openFileTab.file} />
          ) : (
            <FileContentView agentId={agent.id} filePath={openFileTab.path} />
          )}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
          {agent.messages.length === 0 && !uiIsStreaming ? (
            <div className="flex-1 min-h-0"><CreationView agent={agent} /></div>
          ) : (
            <div ref={setScrollContainer} className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-10 py-8">
                {hasMore && (
                  <div className="flex justify-center pb-4">
                    <button
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isLoadingMore ? (
                        <IconLoader2 size={13} className="animate-spin" />
                      ) : (
                        <IconChevronUp size={13} />
                      )}
                      {isLoadingMore ? "Loading…" : "Load earlier messages"}
                    </button>
                  </div>
                )}
                {agent.messages.map((msg, i) => (
                  <MessageBubble key={msg.id} msg={msg} isStreaming={uiIsStreaming && i === agent.messages.length - 1} />
                ))}
                {uiIsStreaming && <TypingBubble elapsedSeconds={elapsedSeconds} />}
                {messageQueue.filter((m) => m.agentId === agent.id).map((qm) => (
                  <div key={qm.id} className="mb-5 group relative">
                    <div className="bg-card border border-border rounded-xl px-5 py-4 opacity-50">
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{qm.display}</p>
                    </div>
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setInput(qm.display)
                          setMessageQueue((prev) => prev.filter((m) => m.id !== qm.id))
                        }}
                        className="p-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit queued message"
                      >
                        <IconPencil size={11} />
                      </button>
                      <button
                        onClick={() => setMessageQueue((prev) => prev.filter((m) => m.id !== qm.id))}
                        className="p-1 rounded bg-card border border-border text-muted-foreground hover:text-red-400 transition-colors"
                        title="Cancel queued message"
                      >
                        <IconX size={11} />
                      </button>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          )}

          {/* Team agent bar + input — wrapped so button can float above them */}
          <div className="shrink-0 relative">
            {!isAtBottom && agent.messages.length > 0 && (
              <button
                onClick={() => {
                  setIsAtBottom(true)
                  bottomRef.current?.scrollIntoView({ behavior: "smooth" })
                }}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-lg text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
              >
                <IconChevronDown size={13} />
                <span>Scroll to bottom</span>
              </button>
            )}
            <div className="px-5 py-4">
            <TeamAgentBar agents={extractTeamAgents(agent.messages, uiIsStreaming)} isStreaming={uiIsStreaming} agentId={agent.id} />
            <TasksBar todos={extractLatestTodos(agent.messages)} agentId={agent.id} isStreaming={uiIsStreaming} />
            {pendingQuestion && pendingQuestion.agentId === agent.id && pendingQuestion.questions.length > 0 && (
              <AskUserQuestionCard
                questions={pendingQuestion.questions}
                onSubmit={handleAnswerQuestion}
              />
            )}
            <div className="relative">
              {/* @ mention picker */}
              {mentionQuery !== null && mentionOptions.length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10">
                  <div className="px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Files & Context</span>
                  </div>
                  <div ref={mentionListRef} className="max-h-52 overflow-y-auto">
                    {mentionOptions.map((opt, i) => (
                      <MentionRow
                        key={opt.type === "terminal" ? "__terminal__" : opt.path}
                        option={opt}
                        agentId={agent.id}
                        isActive={i === mentionIndex}
                        onSelect={() => applyMention(opt)}
                        rowRef={i === mentionIndex ? mentionActiveRef : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Slash command picker */}
              {slashQuery !== null && filteredCommands.length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10">
                  <div className="px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Commands</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredCommands.map((cmd, i) => (
                      <button
                        key={cmd.name}
                        onMouseDown={(e) => { e.preventDefault(); applySlashCommand(cmd.name) }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                          i === slashIndex ? "bg-accent" : "hover:bg-accent/50"
                        )}
                      >
                        <span className="text-[12px] font-mono font-semibold text-foreground/80 shrink-0 w-24 truncate">/{cmd.name}</span>
                        <span className="text-[11px] text-muted-foreground/60 leading-relaxed flex-1 truncate">{cmd.description}</span>
                        {cmd.source === "skill" && (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">skill</span>
                        )}
                        {cmd.args && (
                          <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">{cmd.args}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div
                className={cn(
                  "bg-card rounded-xl transition-colors relative",
                  isDragOver
                    ? "border-2 border-dashed border-ring"
                    : showPlanApproval
                      ? "border-2 border-dashed border-emerald-500/60"
                      : isInPlanMode
                        ? "border-2 border-dashed border-primary/60 focus-within:border-primary"
                        : "border border-border focus-within:border-ring"
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {(pendingComments.length > 0 || attachments.length > 0 || linkedAgents.length > 0 || mentionAttachments.some((m) => m.type === "terminal")) && (
                  <div className="flex flex-wrap gap-2 px-4 pt-3">
                    {pendingComments.map((c) => {
                      const loc = c.path ? c.path.split("/").pop() + (c.line ? `:${c.line}` : "") : null
                      return (
                        <div key={c.id} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px]">
                          <IconMessageCircle size={12} className="text-muted-foreground/60 shrink-0" />
                          <span className="font-medium text-foreground/80">{loc ?? `@${c.author}`}</span>
                          <span className="text-muted-foreground/50 uppercase tracking-wide font-medium text-[9px]">Comment</span>
                          <button onClick={() => onRemoveComment?.(c.id)} className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5">
                            <IconX size={11} />
                          </button>
                        </div>
                      )
                    })}
                    {attachments.map((f) => (
                      <div key={f.path} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px]">
                        {f.mimeType.startsWith("image/")
                          ? <IconPhoto size={12} className="text-muted-foreground/60 shrink-0" />
                          : <IconPaperclip size={12} className="text-muted-foreground/60 shrink-0" />
                        }
                        <span className="font-medium text-foreground/80 max-w-[120px] truncate">{f.name}</span>
                        <button onClick={() => setAttachments((p) => p.filter((x) => x.path !== f.path))} className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5">
                          <IconX size={11} />
                        </button>
                      </div>
                    ))}
                    {linkedAgents.map((a) => (
                      <div key={a.id} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px]">
                        <IconFolderSymlink size={12} className="text-blue-400 shrink-0" />
                        <span className="font-medium text-blue-300 max-w-[120px] truncate">{a.title}</span>
                        <button onClick={() => setLinkedAgents((p) => p.filter((x) => x.id !== a.id))} className="text-blue-400/50 hover:text-blue-300 transition-colors ml-0.5">
                          <IconX size={11} />
                        </button>
                      </div>
                    ))}
                    {mentionAttachments.filter((ma) => ma.type === "terminal").map((ma) => (
                      <TerminalChip key="__terminal__" agentId={agent.id} onRemove={() => setMentionAttachments((p) => p.filter((x) => x !== ma))} />
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={showPlanApproval ? "Approve or dismiss the plan…" : agent.messages.length === 0 ? "Tell the agent what to work on…" : "Add a follow up"}
                  rows={2}
                  className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none overflow-y-auto"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const files = Array.from(e.dataTransfer.files); if (files.length > 0) uploadFiles(files) }}
                  onPaste={(e) => {
                    // Handle pasted files/images from clipboard
                    const clipboardFiles = Array.from(e.clipboardData.items)
                      .filter((item) => item.kind === "file")
                      .map((item) => item.getAsFile())
                      .filter((f): f is File => f !== null)
                    if (clipboardFiles.length > 0) {
                      e.preventDefault()
                      uploadFiles(clipboardFiles)
                      return
                    }
                    // Auto-convert large text pastes to file attachments
                    if (!getAutoConvert()) return
                    const text = e.clipboardData.getData("text/plain")
                    if (text.length > 5000) {
                      e.preventDefault()
                      const blob = new Blob([text], { type: "text/plain" })
                      const file = new File([blob], "pasted-text.txt", { type: "text/plain" })
                      uploadFiles([file])
                    }
                  }}
                  onKeyDown={(e) => {
                    if (mentionQuery !== null && mentionOptions.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionOptions.length); return }
                      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length); return }
                      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applyMention(mentionOptions[mentionIndex]); return }
                      if (e.key === "Escape") { setMentionQuery(null); return }
                    }
                    if (slashQuery !== null && filteredCommands.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % filteredCommands.length); return }
                      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length); return }
                      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applySlashCommand(filteredCommands[slashIndex].name); return }
                      if (e.key === "Escape") { setSlashQuery(null); return }
                    }
                    if (e.key === "Tab" && e.shiftKey) {
                      e.preventDefault()
                      setPlanMode((v) => !v)
                      return
                    }
                    if (e.key === "u" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      fileInputRef.current?.click()
                      return
                    }
                    const sendWith = getSendWith()
                    const shouldSend =
                      sendWith === "enter" ? (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) :
                      sendWith === "cmd-enter" ? (e.key === "Enter" && (e.metaKey || e.ctrlKey)) :
                      sendWith === "shift-enter" ? (e.key === "Enter" && e.shiftKey) :
                      false
                    if (shouldSend) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <div className="flex items-center justify-between px-3 pb-3">
                  <div className="flex items-center gap-1">
                    <Select value={`${agent.provider ?? "claude"}:${agent.model}`} onValueChange={handleModelChange}>
                      <SelectTrigger className="h-auto border-0 shadow-none bg-transparent px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground gap-1.5 focus:ring-0 [&>svg]:hidden">
                        <IconSparkles size={13} className="text-muted-foreground shrink-0" />
                        <SelectValue>{allModels.find((m) => m.id === agent.model)?.label ?? agent.model}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const grouped = new Map<string, typeof allModels>()
                          for (const m of allModels) {
                            const list = grouped.get(m.provider) ?? []
                            list.push(m)
                            grouped.set(m.provider, list)
                          }
                          const entries = [...grouped.entries()]
                          return entries.map(([providerId, models]) => (
                            <React.Fragment key={providerId}>
                              {entries.length > 1 && (
                                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                                  {providers.find((p) => p.id === providerId)?.name ?? providerId}
                                </div>
                              )}
                              {models.map((m) => (
                                <SelectItem key={`${providerId}:${m.id}`} value={`${providerId}:${m.id}`}>{m.label}</SelectItem>
                              ))}
                            </React.Fragment>
                          ))
                        })()}
                      </SelectContent>
                    </Select>
                    {(capabilities.effortLevels as string[] ?? []).length > 0 && (
                      <Select value={effort || "default"} onValueChange={(v) => setEffort(v === "default" ? "" : v as typeof effort)}>
                        <SelectTrigger className="h-auto border-0 shadow-none bg-transparent px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground gap-1.5 focus:ring-0 [&>svg]:hidden">
                          <IconBrain size={13} className={cn("shrink-0", effort ? "text-foreground" : "text-muted-foreground/60")} />
                          <SelectValue>{effort ? `Effort: ${effort}` : "Effort"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Auto</SelectItem>
                          {(capabilities.effortLevels as string[]).map((lvl) => (
                            <SelectItem key={lvl} value={lvl}>{lvl.charAt(0).toUpperCase() + lvl.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {!hideChrome && (capabilities.planMode !== false) && (
                      <button
                        onClick={() => setPlanMode(!planMode)}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
                          isInPlanMode ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground/60"
                      )}
                    >
                        <IconMap size={13} />
                        <span>Plan</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.md,.csv,.json" className="hidden" onChange={handleFileSelect} />
                    <ContextRing messages={agent.messages} />
                    <Popover open={plusOpen} onOpenChange={setPlusOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
                          <IconPlus size={13} />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="end" className="w-52 p-1">
                        <button
                          onClick={() => { fileInputRef.current?.click() }}
                          className="flex items-center gap-3 w-full px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-md transition-colors"
                        >
                          <IconPaperclip size={15} className="text-muted-foreground shrink-0" />
                          <span>Add attachment</span>
                          <span className="ml-auto text-[11px] text-muted-foreground/50 font-mono">⌘U</span>
                        </button>
                        {!hideChrome && <Popover open={agentPickerOpen} onOpenChange={(o) => { setAgentPickerOpen(o); if (o) setAgentPickerSearch("") }}>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-3 w-full px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-md transition-colors">
                              <IconFolderSymlink size={15} className="text-muted-foreground shrink-0" />
                              <span>Link workspaces</span>
                              {linkedAgents.length > 0 && (
                                <span className="ml-auto text-[11px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{linkedAgents.length}</span>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="left" align="start" className="w-64 p-0">
                            <input
                              value={agentPickerSearch}
                              onChange={(e) => setAgentPickerSearch(e.target.value)}
                              placeholder="Search workspaces…"
                              autoFocus
                              className="w-full bg-transparent border-b border-border px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/40"
                            />
                            <div className="max-h-48 overflow-y-auto p-1">
                              {allAgents
                                .filter((a) => a.id !== agent.id)
                                .filter((a) => !agentPickerSearch || a.title.toLowerCase().includes(agentPickerSearch.toLowerCase()) || a.branch.toLowerCase().includes(agentPickerSearch.toLowerCase()))
                                .length === 0 ? (
                                <p className="text-[12px] text-muted-foreground/50 px-3 py-2">No workspaces found</p>
                              ) : (
                                allAgents
                                  .filter((a) => a.id !== agent.id)
                                  .filter((a) => !agentPickerSearch || a.title.toLowerCase().includes(agentPickerSearch.toLowerCase()) || a.branch.toLowerCase().includes(agentPickerSearch.toLowerCase()))
                                  .map((a) => {
                                    const linked = linkedAgents.some((x) => x.id === a.id)
                                    return (
                                      <button
                                        key={a.id}
                                        onClick={() => toggleLinkedAgent(a)}
                                        className={cn(
                                          "flex items-center gap-2.5 w-full px-3 py-1.5 text-[12px] rounded-md transition-colors text-left",
                                          linked ? "bg-blue-500/10 text-blue-300" : "text-foreground hover:bg-accent"
                                        )}
                                      >
                                        <IconFolderSymlink size={12} className={cn("shrink-0", linked ? "text-blue-400" : "text-muted-foreground/50")} />
                                        <span className="truncate flex-1">{a.title}</span>
                                        {linked && <IconCheck size={12} className="text-blue-400 shrink-0" />}
                                      </button>
                                    )
                                  })
                              )}
                            </div>
                            <div className="border-t border-border p-1">
                              <button
                                onClick={() => { setAgentPickerOpen(false); window.dispatchEvent(new CustomEvent("huxflux:new-agent")) }}
                                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                              >
                                <IconPlus size={12} className="shrink-0" />
                                <span>New workspace</span>
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>}
                      </PopoverContent>
                    </Popover>
                    {isStreaming && (
                      <Button
                        size="icon-xs"
                        variant="destructive"
                        onClick={() => api.stopAgent(agent.id).catch(() => {})}
                      >
                        <IconPlayerStop size={13} />
                      </Button>
                    )}
                    {showPlanApproval ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] px-2 text-muted-foreground"
                          onClick={handlePlanDismiss}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 text-[11px] px-2.5 gap-1"
                          onClick={handlePlanApprove}
                        >
                          <IconCheck size={12} />
                          Approve
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon-xs"
                        variant={canSend ? (isStreaming ? "outline" : "default") : "secondary"}
                        disabled={!canSend}
                        onClick={handleSend}
                        title={isStreaming ? "Queue message" : "Send"}
                      >
                        <IconSend size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {showSshSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSshSetup(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-[480px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Remote SSH Setup</h2>
              <button onClick={() => setShowSshSetup(false)} className="text-muted-foreground hover:text-foreground">
                <IconX size={16} />
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground mb-3">
              Set these environment variables on the server before starting Huxflux:
            </p>
            <pre className="bg-background rounded-lg p-3 text-[11px] font-mono text-foreground mb-4 select-all">
{`export HUXFLUX_SSH_HOST=<server-ip-or-hostname>
export HUXFLUX_SSH_USER=<your-username>
huxflux start`}
            </pre>
            <p className="text-[12px] text-muted-foreground mb-1">
              On your machine, install the <strong>Remote - SSH</strong> extension in VS Code or Cursor.
            </p>
            <p className="text-[12px] text-muted-foreground">
              The server must have SSH enabled and accept key-based authentication from your machine.
            </p>
            <div className="mt-4 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowSshSetup(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
