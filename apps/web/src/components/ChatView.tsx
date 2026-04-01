import { useRef, useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { useAgents, useRepos } from "@hive/shared"
import { Button } from "@hive/ui"
import { cn } from "@hive/ui"
import type { Agent, Message, FileChange, ToolCall, PRStatus, PRComment } from "@/data/mock"
import { api, getApiBase } from "@hive/shared"
import { DiffView } from "@/components/DiffView"
import { FileContentView } from "@/components/FileContentView"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  IconChevronDown,
  IconChevronRight,
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
} from "@tabler/icons-react"
import type { AgentSummary } from "@/data/mock"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@hive/ui"
import { Popover, PopoverContent, PopoverTrigger } from "@hive/ui"
import { getSendWith, getAutoConvert, getStripYoureRight, getAlwaysContext } from "@/lib/notificationPrefs"

const MODELS = [
  { id: "claude-opus-4-6",           label: "Opus 4.6" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
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

function fileChip(args: string) {
  const name = args.split("/").pop() ?? args
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] font-mono text-foreground/70 ml-1">
      <IconSparkles size={9} className="text-muted-foreground/50" />
      {name}
    </span>
  )
}

// ── Inline result block ───────────────────────────────────────────────────────

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

// ── Tool call row ─────────────────────────────────────────────────────────────

function ToolCallRow({ call, indent = false }: { call: ToolCall; indent?: boolean }) {
  const [open, setOpen] = useState(true)
  const isAgent = call.tool === "Agent"
  const isRead = call.tool === "Read"

  if (isAgent) {
    return (
      <div className={cn("mt-1", indent && "ml-4")}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
        >
          <IconChevronRight size={12} className={cn("transition-transform shrink-0", open && "rotate-90")} />
          <IconSparkles size={12} className="text-muted-foreground/60 shrink-0" />
          <span className="font-medium text-foreground/80">Agent</span>
          {call.args && <span className="text-muted-foreground/60 ml-1">{call.args}</span>}
        </button>
        {open && call.subCalls && (
          <div className="ml-3 mt-0.5 border-l border-border/50 pl-3 space-y-0.5">
            {call.subCalls.map((sub) => (
              <ToolCallRow key={sub.id} call={sub} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("mt-0.5", indent && "ml-4")}>
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground py-0.5">
        {toolIcon(call.tool)}
        <span className="font-medium text-foreground/70 shrink-0">{call.tool}</span>
        {call.args && (
          <span className="font-mono text-[11px] text-muted-foreground/60 truncate min-w-0">
            {truncateArgs(call.args)}
          </span>
        )}
        {isRead && call.args && fileChip(call.args)}
      </div>
      {call.result && <ResultBlock result={call.result} />}
    </div>
  )
}

// ── Tool calls accordion ──────────────────────────────────────────────────────

function ToolCallsAccordion({ calls, hasContent, isStreaming }: { calls: ToolCall[]; hasContent: boolean; isStreaming?: boolean }) {
  const [open, setOpen] = useState(true)

  // Collapse as soon as streaming ends, regardless of whether there's text content
  useEffect(() => {
    if (!isStreaming) setOpen(false)
  }, [isStreaming])

  const distinctTools = [...new Set(calls.map((c) => c.tool))]
  const label = calls.length === 1 ? "1 tool call" : `${calls.length} tool calls`
  const summary = distinctTools.slice(0, 4).join(", ") + (distinctTools.length > 4 ? ", …" : "")

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5 group"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0", open && "rotate-90")} />
        <IconBolt size={12} className="text-muted-foreground/50 shrink-0" />
        <span className="font-medium text-foreground/70">{label}</span>
        {!open && (
          <span className="text-muted-foreground/40 ml-1 truncate">{summary}</span>
        )}
      </button>
      {open && (
        <div className="mt-0.5 ml-3 border-l border-border/50 pl-3 space-y-0.5">
          {calls.map((tc) => (
            <ToolCallRow key={tc.id} call={tc} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Thinking block ────────────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.length > 60 ? text.slice(0, 60) + "…" : text

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 text-left w-full group"
      >
        <IconWorld size={13} className="text-muted-foreground/50 shrink-0 mt-0.5" />
        <span className="text-[12px] font-medium text-muted-foreground/70 shrink-0">Thinking</span>
        {!expanded && (
          <span className="text-[12px] text-muted-foreground/40 font-mono truncate ml-1">{preview}</span>
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
      } catch { /* ignore */ }
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
  const hasSubCalls = selected.subCalls && selected.subCalls.length > 0
  const hasOutput = selected.outputText && selected.outputText.trim()
  const hasResult = selected.result && selected.result.trim()

  // Collapse tools accordion when agent finishes
  useEffect(() => {
    if (selected.status === "done") setToolsOpen(false)
  }, [selected.status])

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
            onClick={() => setToolsOpen(!toolsOpen)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
          >
            <IconChevronRight size={11} className={cn("transition-transform shrink-0", toolsOpen && "rotate-90")} />
            <IconBolt size={11} className="text-muted-foreground/50 shrink-0" />
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
        <pre className="text-[11px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap">{selected.outputText}</pre>
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

function TeamAgentBar({ agents, isStreaming }: { agents: TeamAgent[]; isStreaming?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const knownIdsRef = useRef<Set<string>>(new Set())

  // Re-show when new agent IDs appear (handles dismiss → new team)
  useEffect(() => {
    const newIds = agents.filter((a) => !knownIdsRef.current.has(a.id))
    if (newIds.length > 0) {
      for (const a of newIds) knownIdsRef.current.add(a.id)
      setDismissed(false)
      if (!selectedId || !agents.some((a) => a.id === selectedId)) {
        setSelectedId(newIds[0].id)
      }
    }
  }, [agents]) // eslint-disable-line react-hooks/exhaustive-deps

  if (dismissed || agents.length < 2) return null

  const selected = agents.find((a) => a.id === selectedId) ?? agents[0]
  const runningCount = agents.filter((a) => a.status === "running").length
  const doneCount = agents.filter((a) => a.status === "done").length

  return (
    <div className="border-t border-border bg-card/50 shrink-0">
      {/* Tab bar */}
      <div className="border-b border-border/60">
        <div className="px-5">
          <div className="flex items-center gap-1 py-1.5 overflow-x-auto">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
            >
              <IconUsers size={13} className="text-muted-foreground/50" />
              <span>Team</span>
              <span className="text-muted-foreground/40 font-mono">
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
                  onClick={() => { setSelectedId(agent.id); setCollapsed(false) }}
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
              onClick={() => setDismissed(true)}
              className="ml-auto p-1 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
              title="Close team panel"
            >
              <IconX size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Output panel */}
      {!collapsed && selected && (
        <div className="px-5">
          <TeamAgentOutput selected={selected} />
        </div>
      )}
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
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
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
            {children}
          </a>
        ),
        hr: () => <hr className="border-border my-4" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingBubble() {
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-1.5 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-muted-foreground/30"
            style={{
              animation: `typingBounce 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isStreaming }: { msg: Message; isStreaming?: boolean }) {
  const isUser = msg.role === "user"
  const isEmpty = !msg.content && !msg.thinking && (!msg.toolCalls || msg.toolCalls.length === 0)

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
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{displayText}</p>
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

      {/* Tool calls */}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <ToolCallsAccordion calls={msg.toolCalls} hasContent={!!msg.content} isStreaming={isStreaming} />
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
}

// ── PR status pill ────────────────────────────────────────────────────────────

function PRStatusPill({ prStatus, agentId }: { prStatus: PRStatus; agentId: string }) {
  const [marking, setMarking] = useState(false)
  const [rerequesting, setRerequesting] = useState(false)

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

  const { label, pill } = (() => {
    if (prStatus.merged)
      return { label: "Merged", pill: "bg-purple-500/10 border-purple-500/25 text-purple-400" }
    if (prStatus.draft)
      return { label: "Draft PR open", pill: "bg-zinc-500/10 border-zinc-500/25 text-zinc-400" }
    if (prStatus.hasChangeRequests)
      return { label: "PR changes requested", pill: "bg-orange-500/10 border-orange-500/25 text-orange-400" }
    if (prStatus.mergeableState === "blocked" || prStatus.mergeableState === "dirty")
      return { label: prStatus.mergeableState === "dirty" ? "Merge conflict" : "Blocked", pill: "bg-red-500/10 border-red-500/25 text-red-400" }
    if (prStatus.state === "open" && !prStatus.draft && !prStatus.hasChangeRequests && prStatus.mergeableState !== "behind")
      return { label: "Ready to merge", pill: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" }
    return { label: "In review", pill: "bg-blue-500/10 border-blue-500/25 text-blue-400" }
  })()

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={prStatus.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary border border-border text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors"
      >
        #{prStatus.number}
        <IconArrowUpRight size={10} />
      </a>
      <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium", pill)}>
        {label}
      </div>
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
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center">
          <IconHexagon size={24} className="text-amber-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{agent.title}</p>
          <p className="text-[12px] text-muted-foreground/60 mt-0.5 font-mono">{agent.branch}</p>
        </div>
      </div>

      <div className="w-full max-w-xs bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <IconGitBranch size={12} className="text-muted-foreground/40" />
          <span className="text-[11px] text-muted-foreground/60 font-mono">{agent.location}</span>
        </div>
        <div className="px-4 py-3 space-y-2 text-[12px] text-muted-foreground/60">
          <div className="flex items-center justify-between">
            <span>Model</span>
            <span className="font-mono text-foreground/70">{agent.model}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Status</span>
            <span className="text-amber-400">Ready</span>
          </div>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground/40 text-center">
        Send a message to get started
      </p>
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
}

export function ChatView({ agent, isStreaming, openFileTab, onClearFileTab, tabs = [], activeTabId, onTabSelect, onTabClose, onNewTab, onTabTitleChange, pendingComments = [], onRemoveComment, onClearComments }: ChatViewProps) {
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
  const [input, setInput] = useState("")
  const [activeTab, setActiveTab] = useState<"chat" | "file">("chat")
  const [thinking, setThinking] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)
  const [planMode, setPlanMode] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [baseBranchOpen, setBaseBranchOpen] = useState(false)
  const [baseBranchSearch, setBaseBranchSearch] = useState("")
  const baseBranchSearchRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<{ name: string; path: string; mimeType: string }[]>([])
  const [linkedAgents, setLinkedAgents] = useState<AgentSummary[]>([])
  const [plusOpen, setPlusOpen] = useState(false)
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: allAgents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const repoName = repos.find((r) => r.id === agent.repoId)?.name
  const { data: repoBranches = [] } = useQuery({
    queryKey: ["repo-branches", agent.repoId],
    queryFn: () => api.getRepoBranches(agent.repoId!),
    enabled: !!agent.repoId && baseBranchOpen,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])


  async function commitTitle() {
    const title = titleDraft.trim()
    setEditingTitle(false)
    if (!title || title === agent.title) return
    await api.updateAgent(agent.id, { title })
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, title } : old)
    onTabTitleChange?.(agent.id, title)
  }

  async function selectBaseBranch(val: string) {
    setBaseBranchOpen(false)
    setBaseBranchSearch("")
    if (!val || val === agent.baseBranch) return
    await api.updateAgent(agent.id, { baseBranch: val })
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, baseBranch: val } : old)
  }
  const [slashQuery, setSlashQuery] = useState<string | null>(null) // null = closed, "" = show all
  const [slashIndex, setSlashIndex] = useState(0)

  async function handleModelChange(model: string) {
    await api.updateAgent(agent.id, { model } as Parameters<typeof api.updateAgent>[1])
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, model } : old)
  }

  const { data: filteredCommands = [] } = useQuery({
    queryKey: ["slash-commands", agent.id, slashQuery],
    queryFn: () => api.getSlashCommands(agent.id, slashQuery ?? undefined),
    enabled: slashQuery !== null,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  function handleInputChange(value: string) {
    setInput(value)
    // Detect "/" at start or after newline
    const lastLine = value.split("\n").pop() ?? ""
    if (lastLine.startsWith("/")) {
      setSlashQuery(lastLine.slice(1))
      setSlashIndex(0)
    } else {
      setSlashQuery(null)
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

  function toggleLinkedAgent(a: AgentSummary) {
    setLinkedAgents((prev) =>
      prev.some((x) => x.id === a.id) ? prev.filter((x) => x.id !== a.id) : [...prev, a]
    )
  }

  function buildContent(text: string) {
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

    if (linkedAgents.length > 0) {
      const agentBlock = linkedAgents.map((a) =>
        `- "${a.title}" (${a.branch}) — ID: ${a.id}`
      ).join("\n")
      content = `${content}\n\n---\n\nLinked agents for cross-repo collaboration:\n${agentBlock}\n\nTo delegate work to a linked agent use:\n  curl -s -X POST ${getApiBase()}/api/agents/<ID>/messages -H "Content-Type: application/json" -d '{"content":"<task>"}'`
    }

    return content
  }

  async function sendContent(content: string) {
    setIsSending(true)
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    }
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => {
      if (!old) return old
      return { ...old, messages: [...old.messages, optimisticMsg] }
    })
    try {
      await api.sendMessage(agent.id, content)
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

    const content = buildContent(text)
    setInput("")
    onClearComments?.()
    setAttachments([])
    setLinkedAgents([])

    if (isStreaming) {
      setQueuedMessage(content)
      return
    }

    void sendContent(content)
  }

  // Auto-send queued message when streaming ends
  useEffect(() => {
    if (!isStreaming && queuedMessage !== null) {
      const msg = queuedMessage
      setQueuedMessage(null)
      void sendContent(msg)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  useEffect(() => {
    if (openFileTab) setActiveTab("file")
  }, [openFileTab])

  useEffect(() => {
    setActiveTab("chat")
    setIsAtBottom(true)
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [agent.id])

  // Auto-scroll to bottom when streaming, but only if the user is already at the bottom
  useEffect(() => {
    if (isStreaming && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [isStreaming, isAtBottom, agent.messages.length])

  const closeFileTab = () => {
    setActiveTab("chat")
    onClearFileTab()
  }

  // If the last assistant message has durationMs, the run is complete regardless of isStreaming.
  // Guards against missed WS events keeping spinners alive after Claude finishes.
  const lastMsg = agent.messages[agent.messages.length - 1]
  const lastMsgDone = lastMsg?.role === "assistant" && lastMsg.durationMs != null
  const uiIsStreaming = isStreaming && !lastMsgDone

  const hasInput = input.trim().length > 0 || pendingComments.length > 0 || attachments.length > 0
  const canSend = hasInput && !isSending

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top metadata bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        {repoName && (
          <>
            <span className="text-[12px] text-muted-foreground/50 font-medium truncate shrink-0 max-w-[120px]">{repoName}</span>
            <span className="text-muted-foreground/30 shrink-0">/</span>
          </>
        )}
        <IconGitBranch size={13} className="text-muted-foreground/50 shrink-0" />
        <span className="text-[12px] text-muted-foreground font-mono truncate">{agent.branch}</span>
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
          {agent.prStatus && (
            <PRStatusPill prStatus={agent.prStatus} agentId={agent.id} />
          )}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border">
            <span className="text-[11px] text-muted-foreground font-mono">/{agent.location}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-border shrink-0 px-2 overflow-x-auto">
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
      </div>

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
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {agent.messages.length === 0 && !uiIsStreaming ? (
            <div className="flex-1 min-h-0"><CreationView agent={agent} /></div>
          ) : (
            <div ref={setScrollContainer} className="flex-1 min-h-0 overflow-y-auto relative">
              <div className="px-10 py-8">
                <StatsBar messages={agent.messages} />
                {agent.messages.map((msg, i) => (
                  <MessageBubble key={msg.id} msg={msg} isStreaming={uiIsStreaming && i === agent.messages.length - 1} />
                ))}
                {uiIsStreaming && <TypingBubble />}
                {queuedMessage !== null && (
                  <div className="mb-5 opacity-40">
                    <div className="bg-card border border-border rounded-xl px-5 py-4">
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{queuedMessage}</p>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Scroll to bottom button — shown when user has scrolled up */}
              {!isAtBottom && (
                <button
                  onClick={() => {
                    setIsAtBottom(true)
                    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
                  }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-lg text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
                >
                  <IconChevronDown size={13} />
                  <span>Scroll to bottom</span>
                </button>
              )}
            </div>
          )}

          {/* Team agent bar */}
          <TeamAgentBar agents={extractTeamAgents(agent.messages, uiIsStreaming)} isStreaming={uiIsStreaming} />

          {/* Input */}
          <div className="px-5 py-4 border-t border-border shrink-0">
            <div className="relative">
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
              <div className={cn(
                "bg-card rounded-xl transition-colors",
                planMode
                  ? "border-2 border-dashed border-primary/60 focus-within:border-primary"
                  : "border border-border focus-within:border-ring"
              )}>
                {(pendingComments.length > 0 || attachments.length > 0 || linkedAgents.length > 0) && (
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
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={agent.messages.length === 0 ? "Tell the agent what to work on…" : "Add a follow up"}
                  rows={2}
                  className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none"
                  onPaste={(e) => {
                    if (!getAutoConvert()) return
                    const text = e.clipboardData.getData("text/plain")
                    if (text.length > 5000) {
                      e.preventDefault()
                      const blob = new Blob([text], { type: "text/plain" })
                      const file = new File([blob], "pasted-text.txt", { type: "text/plain" })
                      const reader = new FileReader()
                      reader.onload = async () => {
                        try {
                          const result = await api.uploadFile(agent.id, file.name, reader.result as string, file.type)
                          setAttachments((prev) => [...prev, result])
                        } catch {
                          // Fall back to inserting text directly
                          setInput((prev) => prev + text)
                        }
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (slashQuery !== null && filteredCommands.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % filteredCommands.length); return }
                      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length); return }
                      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applySlashCommand(filteredCommands[slashIndex].name); return }
                      if (e.key === "Escape") { setSlashQuery(null); return }
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
                    <Select value={agent.model} onValueChange={handleModelChange}>
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
                    <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
                      <IconBolt size={13} />
                    </Button>
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
                      onClick={() => setPlanMode(!planMode)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
                        planMode ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground/60"
                      )}
                    >
                      <IconMap size={13} />
                      <span>Plan</span>
                    </button>
                    <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
                      <IconLayoutGrid size={13} />
                    </Button>
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
                        <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-3 w-full px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-md transition-colors">
                              <IconFolderSymlink size={15} className="text-muted-foreground shrink-0" />
                              <span>Link workspaces</span>
                              {linkedAgents.length > 0 && (
                                <span className="ml-auto text-[11px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{linkedAgents.length}</span>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="left" align="start" className="w-60 p-1">
                            {allAgents.filter((a) => a.id !== agent.id).length === 0 ? (
                              <p className="text-[12px] text-muted-foreground/50 px-3 py-2">No other agents</p>
                            ) : (
                              allAgents.filter((a) => a.id !== agent.id).map((a) => {
                                const linked = linkedAgents.some((x) => x.id === a.id)
                                return (
                                  <button
                                    key={a.id}
                                    onClick={() => toggleLinkedAgent(a)}
                                    className={cn(
                                      "flex items-center gap-2.5 w-full px-3 py-2 text-[12px] rounded-md transition-colors text-left",
                                      linked ? "bg-blue-500/10 text-blue-300" : "text-foreground hover:bg-accent"
                                    )}
                                  >
                                    <IconFolderSymlink size={13} className={linked ? "text-blue-400" : "text-muted-foreground"} />
                                    <div className="min-w-0">
                                      <div className="font-medium truncate">{a.title}</div>
                                      <div className="text-[10px] text-muted-foreground/50 font-mono truncate">{a.branch}</div>
                                    </div>
                                    {linked && <span className="ml-auto text-blue-400 shrink-0">✓</span>}
                                  </button>
                                )
                              })
                            )}
                          </PopoverContent>
                        </Popover>
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
                    <Button
                      size="icon-xs"
                      variant={canSend ? (isStreaming ? "outline" : "default") : "secondary"}
                      disabled={!canSend}
                      onClick={handleSend}
                      title={isStreaming ? "Queue message" : "Send"}
                    >
                      <IconSend size={13} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
