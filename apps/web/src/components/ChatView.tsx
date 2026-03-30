import { useRef, useEffect, useState, useCallback } from "react"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Agent, Message, FileChange, ToolCall } from "@/data/mock"
import { api } from "@/lib/api"
import { DiffView } from "@/components/DiffView"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  IconChevronDown,
  IconChevronRight,
  IconSend,
  IconPlus,
  IconBrain,
  IconCopy,
  IconThumbUp,
  IconThumbDown,
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
} from "@tabler/icons-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user"
  const isEmpty = !msg.content && !msg.thinking && (!msg.toolCalls || msg.toolCalls.length === 0)

  if (isUser) {
    return (
      <div className="mb-5">
        <div className="bg-card border border-border rounded-xl px-5 py-4">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }

  // Empty in-flight assistant message — nothing yet, typing bubble shown separately
  if (isEmpty) {
    return null
  }

  return (
    <div className="mb-5">
      {/* Thinking */}
      {msg.thinking && <ThinkingBlock text={msg.thinking} />}

      {/* Tool calls */}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="mb-3 space-y-0.5">
          {msg.toolCalls.map((tc) => (
            <ToolCallRow key={tc.id} call={tc} />
          ))}
        </div>
      )}

      {/* Content */}
      {msg.content && (
        <div className="text-sm text-foreground leading-relaxed">
          <MarkdownContent content={msg.content} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2.5">
        <span className="text-[11px] text-muted-foreground/50">{msg.timestamp}</span>
        <span className="text-muted-foreground/25">·</span>
        <div className="flex items-center gap-0.5">
          {[IconCopy, IconThumbUp, IconThumbDown, IconRefresh].map((Icon, i) => (
            <Button key={i} variant="ghost" size="icon-xs" className="text-muted-foreground/40">
              <Icon size={12} />
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Elapsed timer ─────────────────────────────────────────────────────────────

function useElapsedSeconds(running: boolean) {
  const [seconds, setSeconds] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (running) {
      startRef.current = Date.now()
      setSeconds(0)
      const id = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startRef.current!) / 1000))
      }, 1000)
      return () => clearInterval(id)
    } else {
      startRef.current = null
    }
  }, [running])

  return seconds
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

// ── Main component ────────────────────────────────────────────────────────────

interface ChatViewProps {
  agent: Agent
  isStreaming: boolean
  openFileTab: FileChange | null
  onClearFileTab: () => void
}

export function ChatView({ agent, isStreaming, openFileTab, onClearFileTab }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [activeTab, setActiveTab] = useState<"chat" | "file">("chat")
  const [thinking, setThinking] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const elapsed = useElapsedSeconds(isStreaming)
  const [planMode, setPlanMode] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const titleInputRef = useRef<HTMLInputElement>(null)

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

  async function handleSend() {
    const content = input.trim()
    if (!content || isSending || isStreaming) return
    setInput("")
    setIsSending(true)

    // Optimistically add user message to cache immediately
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
      // Roll back optimistic message on failure
      queryClient.setQueryData<Agent>(["agent", agent.id], (old) => {
        if (!old) return old
        return { ...old, messages: old.messages.filter((m) => m.id !== optimisticMsg.id) }
      })
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    if (openFileTab) setActiveTab("file")
  }, [openFileTab])

  useEffect(() => {
    setActiveTab("chat")
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [agent.id])

  // Auto-scroll when streaming
  useEffect(() => {
    if (isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [isStreaming, agent.messages.length])

  const closeFileTab = () => {
    setActiveTab("chat")
    onClearFileTab()
  }

  const canSend = input.trim().length > 0 && !isSending && !isStreaming

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top metadata bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <IconGitBranch size={13} className="text-muted-foreground/50 shrink-0" />
        <span className="text-[12px] text-muted-foreground font-mono truncate">{agent.branch}</span>
        <span className="text-muted-foreground/30 shrink-0">›</span>
        <span className="text-[12px] text-muted-foreground/60 shrink-0">origin/develop</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {isStreaming && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] text-amber-400 font-mono tabular-nums">
                Working… {elapsed}s
              </span>
            </div>
          )}
          {agent.pr && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border">
              <span className="text-[11px] text-muted-foreground font-mono">{agent.pr}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border">
            <span className="text-[11px] text-muted-foreground font-mono">/{agent.location}</span>
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
          <IconSparkles size={12} className="shrink-0" />
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTitle() }
                if (e.key === "Escape") setEditingTitle(false)
              }}
              onBlur={commitTitle}
              className="bg-background border border-ring rounded px-1.5 py-0.5 outline-none text-foreground w-48"
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setTitleDraft(agent.title); setEditingTitle(true) }}
              title="Double-click to rename"
            >
              {agent.title.length > 32 ? agent.title.slice(0, 32) + "…" : agent.title}
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

        <button className="ml-1 p-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
          <IconPlus size={13} />
        </button>
      </div>

      {/* Content */}
      {activeTab === "file" && openFileTab ? (
        <div className="flex-1 min-h-0">
          <DiffView agentId={agent.id} file={openFileTab} />
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0">
            {agent.messages.length === 0 && !isStreaming ? (
              <CreationView agent={agent} />
            ) : (
              <ScrollArea className="h-full">
                <div className="px-5 py-6 max-w-3xl mx-auto">
                  <StatsBar messages={agent.messages} />
                  {agent.messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                  {isStreaming && <TypingBubble />}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Input */}
          <div className="px-5 py-4 border-t border-border shrink-0">
            <div className="max-w-3xl mx-auto relative">
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
                <textarea
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={agent.messages.length === 0 ? "Tell the agent what to work on…" : "Add a follow up"}
                  rows={2}
                  disabled={isStreaming}
                  className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    if (slashQuery !== null && filteredCommands.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % filteredCommands.length); return }
                      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length); return }
                      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applySlashCommand(filteredCommands[slashIndex].name); return }
                      if (e.key === "Escape") { setSlashQuery(null); return }
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
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
                    <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
                      <IconPaperclip size={13} />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
                      <IconPlus size={13} />
                    </Button>
                    {isStreaming ? (
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
        </>
      )}
    </div>
  )
}
