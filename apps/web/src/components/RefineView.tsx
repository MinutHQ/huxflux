import { useState, useRef, useCallback, useEffect } from "react"
import { ScrollArea, Button, cn, ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@hive/ui"
import { useRepos } from "@hive/shared"
import type { Repo } from "@hive/shared"
import {
  IconSend,
  IconFlask,
  IconGitBranch,
  IconCircle,
  IconCircleCheck,
  IconTicket,
  IconListDetails,
  IconCheck,
  IconPencil,
  IconTrash,
  IconX,
  IconPlus,
} from "@tabler/icons-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RefineSubtask {
  id: string
  repoId: string
  repoName: string
  title: string
}

export interface RefineMessage {
  id: string
  role: "user" | "agent"
  content: string
  type: "text" | "repo-select"
  timestamp: string
}

export interface RefineSession {
  id: string
  ticketId: string
  status: "repos" | "questions" | "done"
  repoIds: string[]
  messages: RefineMessage[]
  answers: string[]
  subtasks: RefineSubtask[]
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

// ── Script ────────────────────────────────────────────────────────────────────

const QUESTIONS = [
  "What is the **goal of this change** from the user's perspective? What problem does it solve?",
  "Are there any **existing patterns, APIs, or components** we should reuse or stay consistent with?",
  "What are the **acceptance criteria**? How will we know this task is done?",
]

function generateSubtasks(session: RefineSession, repos: Repo[]): RefineSubtask[] {
  const selected = session.repoIds
    .map((id) => repos.find((r) => r.id === id))
    .filter((r): r is Repo => !!r)

  const tasks: RefineSubtask[] = selected.map((repo) => ({
    id: `${repo.id}-impl`,
    repoId: repo.id,
    repoName: repo.name,
    title: `Implement changes for ${session.ticketId}`,
  }))

  if (selected.length >= 2) {
    tasks.push({
      id: `${selected[0].id}-tests`,
      repoId: selected[0].id,
      repoName: selected[0].name,
      title: `Write tests for ${session.ticketId}`,
    })
  }

  return tasks
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-muted rounded-tl-sm w-fit">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

// ── Repo selector widget ──────────────────────────────────────────────────────

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
  return (
    <div className="flex flex-col gap-2 mt-3">
      <div className="flex flex-wrap gap-1.5">
        {repos.map((repo) => {
          const isSelected = selected.includes(repo.id)
          return (
            <button
              key={repo.id}
              onClick={() => {
                if (confirmed) return
                onChange(isSelected ? selected.filter((x) => x !== repo.id) : [...selected, repo.id])
              }}
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
        <Button size="sm" className="self-start h-7 text-xs" disabled={selected.length === 0} onClick={onConfirm}>
          Confirm
        </Button>
      )}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

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
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
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
          <span className="whitespace-pre-wrap">{msg.content}</span>
        )}
      </div>
    </div>
  )
}

// ── Inline editable field ─────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
  multiline = true,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function commit() {
    onSave(draft.trim())
    setEditing(false)
  }
  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  return (
    <div className="space-y-1.5 group/field">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">{label}</span>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true) }}
            className="opacity-0 group-hover/field:opacity-100 transition-opacity text-muted-foreground/40 hover:text-muted-foreground"
          >
            <IconPencil size={11} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1.5">
          {multiline ? (
            <textarea
              ref={ref as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") cancel() }}
              rows={3}
              className="w-full text-sm bg-muted/50 border border-border rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:border-ring"
            />
          ) : (
            <input
              ref={ref as React.RefObject<HTMLInputElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel() }}
              className="w-full text-sm bg-muted/50 border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-ring"
            />
          )}
          <div className="flex gap-1.5">
            <Button size="sm" className="h-6 text-[11px] px-2.5" onClick={commit}>Save</Button>
            <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p
          className="text-sm text-foreground leading-relaxed cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 transition-colors"
          onClick={() => { setDraft(value); setEditing(true) }}
        >
          {value || <span className="text-muted-foreground/40 italic">Empty — click to edit</span>}
        </p>
      )}
    </div>
  )
}

// ── Spec panel ────────────────────────────────────────────────────────────────

function SpecPanel({
  session,
  repos,
  onUpdate,
}: {
  session: RefineSession
  repos: Repo[]
  onUpdate: (s: RefineSession) => void
}) {
  const selectedRepos = session.repoIds
    .map((id) => repos.find((r) => r.id === id))
    .filter((r): r is Repo => !!r)

  const [goal = "", patterns = "", criteria = ""] = session.answers

  const criteriaItems = criteria
    ? criteria.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean)
    : []

  // Editing state for subtasks
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [subtaskDraft, setSubtaskDraft] = useState("")

  function updateAnswer(index: number, value: string) {
    const next = [...session.answers]
    while (next.length <= index) next.push("")
    next[index] = value
    onUpdate({ ...session, answers: next })
  }

  function removeSubtask(id: string) {
    onUpdate({ ...session, subtasks: session.subtasks.filter((t) => t.id !== id) })
  }

  function saveSubtask(id: string) {
    onUpdate({
      ...session,
      subtasks: session.subtasks.map((t) => t.id === id ? { ...t, title: subtaskDraft.trim() || t.title } : t),
    })
    setEditingSubtaskId(null)
  }

  function addSubtask() {
    const firstRepo = selectedRepos[0]
    if (!firstRepo) return
    const id = `subtask-${Date.now()}`
    onUpdate({
      ...session,
      subtasks: [
        ...session.subtasks,
        { id, repoId: firstRepo.id, repoName: firstRepo.name, title: "New subtask" },
      ],
    })
    setEditingSubtaskId(id)
    setSubtaskDraft("New subtask")
  }

  const hasContent = goal || patterns || criteria || session.subtasks.length > 0 || selectedRepos.length > 0

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <IconListDetails size={13} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Task Spec</span>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Ticket ID */}
          <div className="flex items-center gap-2">
            <IconTicket size={14} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-mono font-medium">{session.ticketId}</span>
          </div>

          {/* Repos */}
          {selectedRepos.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Repos</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedRepos.map((repo) => (
                  <span key={repo.id} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[11px] text-primary font-medium">
                    <IconGitBranch size={10} />
                    {repo.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Goal */}
          {goal && (
            <EditableField
              label="Goal"
              value={goal}
              onSave={(v) => updateAnswer(0, v)}
            />
          )}

          {/* Notes */}
          {patterns && !/^(n\/a|none|-)$/i.test(patterns.trim()) && (
            <EditableField
              label="Notes"
              value={patterns}
              onSave={(v) => updateAnswer(1, v)}
            />
          )}

          {/* Acceptance Criteria */}
          {criteriaItems.length > 0 && (
            <EditableField
              label="Acceptance Criteria"
              value={criteria}
              onSave={(v) => updateAnswer(2, v)}
            />
          )}

          {/* Subtasks */}
          {(session.subtasks.length > 0 || selectedRepos.length > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Subtasks</span>
                <button
                  onClick={addSubtask}
                  disabled={selectedRepos.length === 0}
                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-30"
                  title="Add subtask"
                >
                  <IconPlus size={11} />
                </button>
              </div>
              <div className="space-y-1.5">
                {session.subtasks.map((task) => (
                  <div key={task.id} className="group/task rounded-lg border border-border bg-card text-sm overflow-hidden">
                    {editingSubtaskId === task.id ? (
                      <div className="p-2.5 space-y-1.5">
                        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-block">
                          {task.repoName}
                        </span>
                        <input
                          autoFocus
                          value={subtaskDraft}
                          onChange={(e) => setSubtaskDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveSubtask(task.id)
                            if (e.key === "Escape") setEditingSubtaskId(null)
                          }}
                          className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1 focus:outline-none focus:border-ring"
                        />
                        <div className="flex gap-1.5">
                          <Button size="sm" className="h-6 text-[11px] px-2.5" onClick={() => saveSubtask(task.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => setEditingSubtaskId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 px-3 py-2">
                        <IconCircleCheck size={14} className="text-muted-foreground/30 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground block w-fit mb-0.5">
                            {task.repoName}
                          </span>
                          <span className="text-foreground leading-snug">{task.title}</span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => { setEditingSubtaskId(task.id); setSubtaskDraft(task.title) }}
                            className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <IconPencil size={11} />
                          </button>
                          <button
                            onClick={() => removeSubtask(task.id)}
                            className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <IconTrash size={11} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasContent && (
            <p className="text-center py-8 text-muted-foreground/40 text-sm">
              Spec builds up as you answer questions
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Conversation pane ─────────────────────────────────────────────────────────

function ConversationPane({
  session,
  onUpdate,
  repos,
}: {
  session: RefineSession
  onUpdate: (s: RefineSession) => void
  repos: Repo[]
}) {
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [selectedRepos, setSelectedRepos] = useState<string[]>(session.repoIds)
  const reposConfirmed = session.status !== "repos"
  const bottomRef = useRef<HTMLDivElement>(null)

  const addAgentMessage = useCallback(
    (content: string, type: RefineMessage["type"], base: RefineSession): RefineSession => ({
      ...base,
      messages: [
        ...base.messages,
        { id: `agent-${Date.now()}`, role: "agent" as const, content, type, timestamp: new Date().toISOString() },
      ],
    }),
    []
  )

  // Scroll to bottom on new messages / typing change — use ref callback to trigger on each relevant change
  const messagesLen = session.messages.length
  const bottomRefCb = useCallback((el: HTMLDivElement | null) => {
    // @ts-expect-error assign mutable ref
    bottomRef.current = el
    el?.scrollIntoView({ behavior: "smooth" })
  }, [messagesLen, isTyping]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleReposConfirm() {
    if (selectedRepos.length === 0) return
    const withRepos: RefineSession = { ...session, repoIds: selectedRepos, status: "questions" }
    onUpdate(withRepos)
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      onUpdate(addAgentMessage(QUESTIONS[0], "text", withRepos))
    }, 900)
  }

  function handleSend() {
    const text = input.trim()
    if (!text || isTyping || session.status === "done") return
    setInput("")

    const newAnswers = [...session.answers, text]
    const withUser: RefineSession = {
      ...session,
      messages: [
        ...session.messages,
        { id: `user-${Date.now()}`, role: "user" as const, content: text, type: "text" as const, timestamp: new Date().toISOString() },
      ],
      answers: newAnswers,
    }
    onUpdate(withUser)
    setIsTyping(true)

    const nextIdx = newAnswers.length
    if (nextIdx < QUESTIONS.length) {
      setTimeout(() => {
        setIsTyping(false)
        onUpdate(addAgentMessage(QUESTIONS[nextIdx], "text", withUser))
      }, 700 + Math.random() * 400)
    } else {
      const subtasks = generateSubtasks(withUser, repos)
      const done: RefineSession = { ...withUser, subtasks, status: "done" }
      const repoNames = done.repoIds.map((id) => repos.find((r) => r.id === id)?.name ?? id).join(", ")
      onUpdate(done)
      setTimeout(() => {
        setIsTyping(false)
        onUpdate(addAgentMessage(
          `I have enough context. I've built the task spec with ${subtasks.length} subtask${subtasks.length !== 1 ? "s" : ""} across **${repoNames}**.`,
          "text",
          done
        ))
      }, 1000 + Math.random() * 500)
    }
  }

  const inputDisabled = isTyping || session.status === "repos" || session.status === "done"

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconFlask size={13} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Refinement</span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground/40">{session.ticketId}</span>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
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
          <div ref={bottomRefCb} />
        </div>
      </ScrollArea>

      {/* Input — matches ChatView design */}
      <div className="p-3 shrink-0">
        <div className={cn(
          "bg-card rounded-xl border transition-colors",
          !inputDisabled && "focus-within:border-ring"
        )}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            disabled={inputDisabled}
            placeholder={
              session.status === "repos" ? "Select repos above first…"
              : session.status === "done" ? "Refinement complete"
              : "Answer…"
            }
            rows={2}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-end px-3 pb-3">
            <Button
              size="icon-xs"
              variant={!inputDisabled && input.trim() ? "default" : "secondary"}
              disabled={inputDisabled || !input.trim()}
              onClick={handleSend}
            >
              <IconSend size={13} />
            </Button>
          </div>
        </div>
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
  const { data: repos = [] } = useRepos()
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
    <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0 h-full">
      <ResizablePanel defaultSize="62" minSize="35">
        <ConversationPane key={session.id} session={session} onUpdate={handleUpdate} repos={repos} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="38" minSize="25">
        <SpecPanel session={session} repos={repos} onUpdate={handleUpdate} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
