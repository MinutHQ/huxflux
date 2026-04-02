import { useState, useEffect, useRef, useCallback } from "react"
import { ScrollArea, Button, cn } from "@hive/ui"
import { api, useAgent, useRepos } from "@hive/shared"
import type { Message } from "@hive/shared"
import {
  IconSend,
  IconFlask,
  IconGitBranch,
  IconCircle,
  IconCircleCheck,
  IconTicket,
  IconListDetails,
  IconLoader2,
  IconPlayerStop,
} from "@tabler/icons-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RefineSubtask {
  repo: string
  title: string
  description?: string
}

export interface TaskSpec {
  title?: string
  description?: string
  repos?: string[]
  acceptanceCriteria?: string[]
  subtasks?: RefineSubtask[]
}

export interface RefineSession {
  id: string
  ticketId: string
  /** ID of the real Claude agent backing this session */
  agentId: string | null
  createdAt: string
}

// ── Persistence ───────────────────────────────────────────────────────────────

export const REFINE_STORAGE_KEY = "huxflux:refine-sessions"

export function loadRefineSessions(): RefineSession[] {
  try {
    const raw = localStorage.getItem(REFINE_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RefineSession[]) : []
  } catch {
    return []
  }
}

export function saveRefineSessions(sessions: RefineSession[]) {
  localStorage.setItem(REFINE_STORAGE_KEY, JSON.stringify(sessions))
}

// ── Initial prompt ────────────────────────────────────────────────────────────

export function buildInitialPrompt(
  ticketId: string,
  repos: { name: string; path: string }[]
): string {
  const repoList = repos.map((r) => `- \`${r.name}\`: \`${r.path}\``).join("\n")
  return `Refine Jira ticket **${ticketId}** into implementation-ready subtasks.

## Steps

1. **Get ticket context** — run \`acli jira get-issue ${ticketId}\` to read the full description, acceptance criteria, and current status.

2. **Explore the codebase** — the following repos are configured:
${repoList}
   Browse relevant files to understand existing patterns, naming conventions, and what needs to change. Focus on areas the ticket likely touches.

3. **Ask clarifying questions** — based on the ticket and code, ask 2–3 focused questions to clarify scope or approach.

4. **Output the task spec** — once you have enough context, output a structured spec in this exact format (as a fenced code block tagged \`task-spec\`):

\`\`\`task-spec
{
  "title": "Short task title",
  "description": "What needs to be built and why",
  "repos": ["repo-name-1"],
  "acceptanceCriteria": ["AC item 1", "AC item 2"],
  "subtasks": [
    { "repo": "repo-name", "title": "Subtask title", "description": "What to implement" }
  ]
}
\`\`\`

Start now — get the ticket and explore the code first.`
}

// ── Spec parser ───────────────────────────────────────────────────────────────

function parseTaskSpec(messages: Message[]): TaskSpec | null {
  // Walk messages in reverse to find the most recent task-spec block
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    const match = msg.content.match(/```task-spec\s*([\s\S]*?)```/)
    if (!match) continue
    try {
      return JSON.parse(match[1].trim()) as TaskSpec
    } catch {
      continue
    }
  }
  return null
}

// ── Message renderer ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user"

  // Strip task-spec blocks from display so the raw JSON doesn't clutter the chat
  const displayContent = msg.content.replace(/```task-spec[\s\S]*?```/g, "*(task spec generated — see panel →)*")

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "items-start")}>
      {!isUser && (
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <IconFlask size={11} className="text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              code: ({ children, className }) => {
                if (!className) return <code className="bg-black/20 px-1 rounded text-[12px] font-mono">{children}</code>
                return <code className="block bg-black/20 p-2 rounded text-[12px] font-mono whitespace-pre-wrap my-1">{children}</code>
              },
              ul: ({ children }) => <ul className="list-disc ml-4 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal ml-4 space-y-0.5">{children}</ol>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            }}
          >
            {displayContent}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}

// ── Spec panel ─────────────────────────────────────────────────────────────

function SpecPanel({ spec, isStreaming }: { spec: TaskSpec | null; isStreaming: boolean }) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <IconListDetails size={13} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Task Spec</span>
          {isStreaming && <IconLoader2 size={11} className="text-muted-foreground/40 animate-spin ml-auto" />}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {!spec ? (
            <div className="text-center py-8 text-muted-foreground/40 text-sm space-y-1">
              <IconListDetails size={20} className="mx-auto mb-2 opacity-40" />
              <p>Spec will appear here once the agent completes its analysis</p>
            </div>
          ) : (
            <>
              {/* Title */}
              {spec.title && (
                <p className="text-sm font-semibold text-foreground">{spec.title}</p>
              )}

              {/* Repos */}
              {spec.repos && spec.repos.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Repos</span>
                  <div className="flex flex-wrap gap-1.5">
                    {spec.repos.map((repo) => (
                      <span
                        key={repo}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[11px] text-primary font-medium"
                      >
                        <IconGitBranch size={10} />
                        {repo}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {spec.description && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Description</span>
                  <p className="text-sm text-foreground leading-relaxed">{spec.description}</p>
                </div>
              )}

              {/* Acceptance Criteria */}
              {spec.acceptanceCriteria && spec.acceptanceCriteria.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Acceptance Criteria</span>
                  <ul className="space-y-1">
                    {spec.acceptanceCriteria.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <IconCircle size={12} className="text-muted-foreground/40 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Subtasks */}
              {spec.subtasks && spec.subtasks.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Subtasks</span>
                  <div className="space-y-1.5">
                    {spec.subtasks.map((task, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm"
                      >
                        <IconCircleCheck size={14} className="text-muted-foreground/30 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                              {task.repo}
                            </span>
                          </div>
                          <span className="text-foreground leading-snug block">{task.title}</span>
                          {task.description && (
                            <span className="text-[11px] text-muted-foreground/60 leading-snug block mt-0.5">{task.description}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Main refinement conversation ──────────────────────────────────────────────

function RefineConversation({
  session,
}: {
  session: RefineSession
}) {
  const { data: agent, messages, isStreaming } = useAgent(session.agentId)
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const spec = parseTaskSpec(messages)

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isSending || !session.agentId) return
    setInput("")
    setIsSending(true)
    try {
      await api.sendMessage(session.agentId, text)
    } finally {
      setIsSending(false)
    }
    textareaRef.current?.focus()
  }, [input, isSending, session.agentId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const canSend = !isSending && input.trim().length > 0 && !!session.agentId

  return (
    <div className="flex h-full">
      {/* Conversation */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-border shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconFlask size={13} className="text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Refinement</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground/40">{session.ticketId}</span>
            {isStreaming && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                running
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <IconFlask size={11} className="text-primary" />
                </div>
                <div className="bg-muted px-3 py-2 rounded-xl rounded-tl-sm">
                  <div className="flex items-center gap-1 text-[13px] text-muted-foreground/60">
                    <IconLoader2 size={12} className="animate-spin" />
                    <span>Starting refinement…</span>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input — matches ChatView design */}
        <div className="p-3 shrink-0">
          <div
            className={cn(
              "bg-card rounded-xl border transition-colors",
              "border-border focus-within:border-ring"
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Answer or add context…"
              rows={2}
              className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none"
            />
            <div className="flex items-center justify-end px-3 pb-3 gap-1">
              {isStreaming && (
                <Button
                  size="icon-xs"
                  variant="destructive"
                  onClick={() => session.agentId && api.stopAgent(session.agentId).catch(() => {})}
                >
                  <IconPlayerStop size={13} />
                </Button>
              )}
              <Button
                size="icon-xs"
                variant={canSend ? "default" : "secondary"}
                disabled={!canSend}
                onClick={() => void handleSend()}
              >
                <IconSend size={13} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Spec panel */}
      <div className="w-64 shrink-0 flex flex-col">
        <SpecPanel spec={spec} isStreaming={isStreaming} />
      </div>
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function RefineView({
  sessionId,
  sessions,
  onSessionsChange: _onSessionsChange,
}: {
  sessionId: string | null
  sessions: RefineSession[]
  onSessionsChange: (sessions: RefineSession[]) => void
}) {
  const session = sessions.find((s) => s.id === sessionId) ?? null

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a refinement or start a new one
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 overflow-hidden flex">
      <RefineConversation key={session.id} session={session} />
    </div>
  )
}
