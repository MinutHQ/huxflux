import { useState, useEffect, useRef, useCallback } from "react"
import { ScrollArea, Button, cn } from "@hive/ui"
import { useRepos } from "@hive/shared"
import type { Repo } from "@hive/shared"
import {
  IconSend,
  IconCheck,
  IconLoader2,
  IconGitBranch,
  IconCircleCheck,
  IconCircle,
  IconFlask,
  IconTicket,
  IconListDetails,
} from "@tabler/icons-react"
import ReactMarkdown from "react-markdown"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RefineSubtask {
  id: string
  repoId: string
  repoName: string
  title: string
}

export interface RefineSession {
  id: string
  ticketId: string
  status: "repos" | "questions" | "done"
  repoIds: string[]
  messages: RefineMessage[]
  /** Answers to the 3 refinement questions (indexed 0–2) */
  answers: string[]
  subtasks: RefineSubtask[]
  createdAt: string
}

export interface RefineMessage {
  id: string
  role: "user" | "agent"
  content: string
  type: "text" | "repo-select"
  timestamp: string
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

// ── Script ────────────────────────────────────────────────────────────────────

const QUESTIONS = [
  "What is the **goal of this change** from the user's perspective? What problem does it solve?",
  "Are there any **existing patterns, APIs, or components** we should reuse or stay consistent with?",
  "What are the **acceptance criteria**? How will we know this task is done?",
]

function buildIntroMessage(ticketId: string): string {
  return `I'll help you refine **${ticketId}** into actionable subtasks.\n\nFirst — which repositories are involved in this change? Select all that apply below.`
}

function buildQuestionMessage(index: number): string {
  return QUESTIONS[index]
}

function buildDoneMessage(session: RefineSession, repos: Repo[]): string {
  const repoNames = session.repoIds
    .map((id) => repos.find((r) => r.id === id)?.name ?? id)
    .join(", ")
  return `Great — I have enough context. I've built the task spec on the right and broken it down into ${session.subtasks.length} subtask${session.subtasks.length !== 1 ? "s" : ""} across **${repoNames}**.\n\nYou can now create agents for each subtask.`
}

function generateSubtasks(session: RefineSession, repos: Repo[]): RefineSubtask[] {
  const selectedRepos = session.repoIds
    .map((id) => repos.find((r) => r.id === id))
    .filter((r): r is Repo => !!r)

  if (selectedRepos.length === 0) return []

  const tasks: RefineSubtask[] = []

  for (const repo of selectedRepos) {
    tasks.push({
      id: `${repo.id}-impl`,
      repoId: repo.id,
      repoName: repo.name,
      title: `Implement changes for ${session.ticketId}`,
    })
  }

  // Add a test task to the first repo if multiple repos selected
  if (selectedRepos.length >= 2) {
    const testRepo = selectedRepos[0]
    tasks.push({
      id: `${testRepo.id}-tests`,
      repoId: testRepo.id,
      repoName: testRepo.name,
      title: `Add tests for ${session.ticketId}`,
    })
  }

  return tasks
}

// ── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted w-fit">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

// ── Repo selector (inline message widget) ────────────────────────────────────

function RepoSelector({
  repos,
  selected,
  onChange,
  onConfirm,
  confirmed,
}: {
  repos: Repo[]
  selected: string[]
  onChange: (ids: string[]) => void
  onConfirm: () => void
  confirmed: boolean
}) {
  function toggle(id: string) {
    if (confirmed) return
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    )
  }

  return (
    <div className="flex flex-col gap-2 mt-3">
      <div className="flex flex-wrap gap-1.5">
        {repos.map((repo) => {
          const isSelected = selected.includes(repo.id)
          return (
            <button
              key={repo.id}
              onClick={() => toggle(repo.id)}
              disabled={confirmed}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors",
                isSelected
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                confirmed && "opacity-60 cursor-default"
              )}
            >
              <IconGitBranch size={11} />
              {repo.name}
              {isSelected && <IconCheck size={10} />}
            </button>
          )
        })}
      </div>
      {!confirmed && (
        <Button
          size="sm"
          className="self-start"
          disabled={selected.length === 0}
          onClick={onConfirm}
        >
          Confirm
        </Button>
      )}
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  repos,
  selectedRepos,
  onReposChange,
  onReposConfirm,
  reposConfirmed,
}: {
  msg: RefineMessage
  repos: Repo[]
  selectedRepos: string[]
  onReposChange: (ids: string[]) => void
  onReposConfirm: () => void
  reposConfirmed: boolean
}) {
  const isAgent = msg.role === "agent"
  return (
    <div className={cn("flex gap-2", isAgent ? "items-start" : "items-start flex-row-reverse")}>
      {isAgent && (
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <IconFlask size={11} className="text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed",
          isAgent
            ? "bg-muted text-foreground rounded-tl-sm"
            : "bg-primary text-primary-foreground rounded-tr-sm"
        )}
      >
        {isAgent ? (
          <>
            <ReactMarkdown
              components={{
                p: ({ children }) => <span>{children}</span>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              }}
            >
              {msg.content}
            </ReactMarkdown>
            {msg.type === "repo-select" && (
              <RepoSelector
                repos={repos}
                selected={selectedRepos}
                onChange={onReposChange}
                onConfirm={onReposConfirm}
                confirmed={reposConfirmed}
              />
            )}
          </>
        ) : (
          <span>{msg.content}</span>
        )}
      </div>
    </div>
  )
}

// ── Spec panel ─────────────────────────────────────────────────────────────

function SpecPanel({ session, repos }: { session: RefineSession; repos: Repo[] }) {
  const selectedRepos = session.repoIds
    .map((id) => repos.find((r) => r.id === id))
    .filter((r): r is Repo => !!r)

  const [goal, patterns, criteria] = session.answers

  const criteriaItems = criteria
    ? criteria
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <IconListDetails size={13} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Task Spec</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Ticket */}
          <div className="flex items-center gap-2">
            <IconTicket size={14} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-mono font-medium text-foreground">{session.ticketId}</span>
          </div>

          {/* Repos */}
          {selectedRepos.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Repos</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedRepos.map((repo) => (
                  <span
                    key={repo.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[11px] text-primary font-medium"
                  >
                    <IconGitBranch size={10} />
                    {repo.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Goal / description */}
          {goal && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Goal</span>
              <p className="text-sm text-foreground leading-relaxed">{goal}</p>
            </div>
          )}

          {/* Patterns / notes */}
          {patterns && patterns.toLowerCase() !== "n/a" && patterns.toLowerCase() !== "none" && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Notes</span>
              <p className="text-sm text-foreground leading-relaxed">{patterns}</p>
            </div>
          )}

          {/* Acceptance criteria */}
          {criteriaItems.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Acceptance Criteria</span>
              <ul className="space-y-1">
                {criteriaItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <IconCircle size={12} className="text-muted-foreground/40 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Subtasks */}
          {session.subtasks.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Subtasks</span>
              <div className="space-y-1.5">
                {session.subtasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm"
                  >
                    <IconCircleCheck size={14} className="text-muted-foreground/40 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                          {task.repoName}
                        </span>
                      </div>
                      <span className="text-foreground leading-snug mt-0.5 block">{task.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {session.status === "repos" && session.repoIds.length === 0 && (
            <div className="text-center py-8 text-muted-foreground/40 text-sm">
              Spec will build up as you answer questions
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Main RefineSession view ───────────────────────────────────────────────────

function RefineConversation({
  session,
  onUpdate,
}: {
  session: RefineSession
  onUpdate: (session: RefineSession) => void
}) {
  const { data: repos = [] } = useRepos()
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [selectedRepos, setSelectedRepos] = useState<string[]>(session.repoIds)
  const [reposConfirmed, setReposConfirmed] = useState(session.status !== "repos")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Determine what question we're on (0-indexed)
  const questionIndex = session.answers.length

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [session.messages, isTyping])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function addAgentMessage(
    content: string,
    type: RefineMessage["type"],
    updatedSession: RefineSession
  ): RefineSession {
    const msg: RefineMessage = {
      id: `agent-${Date.now()}`,
      role: "agent",
      content,
      type,
      timestamp: new Date().toISOString(),
    }
    return { ...updatedSession, messages: [...updatedSession.messages, msg] }
  }

  const handleReposConfirm = useCallback(() => {
    if (selectedRepos.length === 0) return
    setReposConfirmed(true)

    const withRepos: RefineSession = { ...session, repoIds: selectedRepos, status: "questions" }

    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      const next = addAgentMessage(QUESTIONS[0], "text", withRepos)
      onUpdate(next)
    }, 900)

    onUpdate(withRepos)
  }, [selectedRepos, session, onUpdate])

  function handleSend() {
    const text = input.trim()
    if (!text || isTyping || session.status === "done") return

    setInput("")

    const userMsg: RefineMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      type: "text",
      timestamp: new Date().toISOString(),
    }

    const newAnswers = [...session.answers, text]
    const withUserMsg: RefineSession = {
      ...session,
      messages: [...session.messages, userMsg],
      answers: newAnswers,
    }
    onUpdate(withUserMsg)

    setIsTyping(true)

    const nextQuestionIdx = newAnswers.length

    if (nextQuestionIdx < QUESTIONS.length) {
      // More questions
      setTimeout(() => {
        setIsTyping(false)
        const next = addAgentMessage(QUESTIONS[nextQuestionIdx], "text", withUserMsg)
        onUpdate(next)
      }, 800 + Math.random() * 400)
    } else {
      // All questions answered — generate spec
      const subtasks = generateSubtasks(withUserMsg, repos)
      const withSubtasks: RefineSession = { ...withUserMsg, subtasks, status: "done" }

      setTimeout(() => {
        setIsTyping(false)
        const next = addAgentMessage(buildDoneMessage(withSubtasks, repos), "text", withSubtasks)
        onUpdate(next)
      }, 1200 + Math.random() * 600)

      onUpdate(withSubtasks)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isInputDisabled = isTyping || session.status === "repos" || session.status === "done"

  return (
    <div className="flex h-full">
      {/* Conversation */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border">
        <div className="px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <IconFlask size={13} className="text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Refinement</span>
            <span className="text-[11px] font-mono text-muted-foreground/40 ml-auto">{session.ticketId}</span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {session.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                repos={repos}
                selectedRepos={selectedRepos}
                onReposChange={setSelectedRepos}
                onReposConfirm={handleReposConfirm}
                reposConfirmed={reposConfirmed}
              />
            ))}

            {isTyping && (
              <div className="flex gap-2 items-start">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <IconFlask size={11} className="text-primary" />
                </div>
                <TypingIndicator />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="px-3 py-2.5 border-t border-border shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isInputDisabled}
              placeholder={
                session.status === "repos"
                  ? "Select repos above first…"
                  : session.status === "done"
                  ? "Refinement complete"
                  : "Answer…"
              }
              className={cn(
                "flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 py-1.5 max-h-32 leading-relaxed",
                isInputDisabled && "opacity-50 cursor-not-allowed"
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={handleSend}
              disabled={isInputDisabled || !input.trim()}
            >
              <IconSend size={13} />
            </Button>
          </div>
        </div>
      </div>

      {/* Spec panel */}
      <div className="w-64 shrink-0 flex flex-col">
        <SpecPanel session={session} repos={repos} />
      </div>
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function RefineView({
  sessionId,
  sessions,
  onSessionsChange,
}: {
  sessionId: string | null
  sessions: RefineSession[]
  onSessionsChange: (sessions: RefineSession[]) => void
}) {
  const session = sessions.find((s) => s.id === sessionId) ?? null

  function handleUpdate(updated: RefineSession) {
    const next = sessions.map((s) => (s.id === updated.id ? updated : s))
    onSessionsChange(next)
    saveRefineSessions(next)
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a refinement or start a new one
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 overflow-hidden flex">
      <RefineConversation
        key={session.id}
        session={session}
        onUpdate={handleUpdate}
      />
    </div>
  )
}
