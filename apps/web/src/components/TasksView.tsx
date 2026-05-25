import { useState, useCallback, useEffect, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { useDroppable } from "@dnd-kit/core"
import { useDraggable } from "@dnd-kit/core"
import { cn } from "@huxflux/ui"
import { ScrollArea } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@huxflux/ui"
import { Popover, PopoverTrigger, PopoverContent } from "@huxflux/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import {
  IconRefresh,
  IconExternalLink,
  IconCircleDot,
  IconChecklist,
  IconPlus,
  IconLoader2,
  IconArrowUp,
  IconArrowDown,
  IconEqual,
  IconUrgent,
  IconSend,
  IconSparkles,
  IconX,
} from "@tabler/icons-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, useAgentEvents, useAgent, useRepos } from "@huxflux/shared"
import type { TaskItem, TaskStatus } from "@huxflux/shared"
import { useNavigate } from "@tanstack/react-router"
import ReactMarkdown from "react-markdown"
import { handleExternalClick, isTauri } from "@/lib/platform"
import { useAppContext } from "@/hooks/useAppContext"
import { ChatView } from "@/components/ChatView"
import { IconGitPullRequest, IconCheck, IconCircleX, IconPlayerPlay, IconTrash } from "@tabler/icons-react"

type TaskColumn = TaskStatus

function useJiraHost(): string {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings() as Promise<{ jiraBaseUrl?: string }>,
    staleTime: 60_000,
  })
  if (data?.jiraBaseUrl) return data.jiraBaseUrl.replace(/\/+$/, "").replace(/^https?:\/\//, "")
  return "jira.atlassian.net" // fallback
}

// ── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { id: TaskColumn; label: string; dotClass: string }[] = [
  { id: "backlog", label: "Backlog", dotClass: "bg-muted-foreground/40" },
  { id: "refining", label: "Refining", dotClass: "bg-purple-500" },
  { id: "ready", label: "Ready", dotClass: "bg-cyan-500" },
  { id: "in-progress", label: "In Progress", dotClass: "bg-amber-400" },
  { id: "in-review", label: "In Review", dotClass: "bg-blue-400" },
  { id: "done", label: "Done", dotClass: "bg-emerald-500" },
]

/** Maps Huxflux columns to Jira transition target statuses */
const COLUMN_TO_JIRA: Partial<Record<TaskColumn, string>> = {
  "backlog": "To Do",
  "in-progress": "In Progress",
  "in-review": "In Review",
  "done": "Done",
}

const PRIORITY_CONFIG: Record<string, { icon: typeof IconUrgent; color: string; label: string }> = {
  highest: { icon: IconUrgent, color: "text-red-500", label: "Urgent" },
  high: { icon: IconArrowUp, color: "text-orange-400", label: "High" },
  medium: { icon: IconEqual, color: "text-amber-400", label: "Medium" },
  low: { icon: IconArrowDown, color: "text-blue-400", label: "Low" },
  lowest: { icon: IconArrowDown, color: "text-muted-foreground/40", label: "Lowest" },
}

function PriorityIcon({ priority, size = 12 }: { priority: string; size?: number }) {
  const config = PRIORITY_CONFIG[priority]
  if (!config) return null
  const Icon = config.icon
  return <Icon size={size} className={cn(config.color, "shrink-0")} />
}

// ── Start Work Popover ──────────────────────────────────────────────────────

function StartWorkPopover({ task, repos, onStart, onClose }: {
  task: TaskItem
  repos: { id: string; name: string }[]
  onStart: (opts: { repoId: string; model: string; provider: string }) => void
  onClose: () => void
}) {
  const [repoId, setRepoId] = useState(task.repoId ?? "")
  const [model, setModel] = useState("Sonnet 4.6")
  const [provider, setProvider] = useState("claude")
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    api.getSettings().then((s: any) => {
      if (s.defaultModel) setModel(s.defaultModel)
      if (s.defaultProvider) setProvider(s.defaultProvider)
    }).catch(() => {})
  }, [])

  const handleStart = async () => {
    if (!repoId || starting) return
    setStarting(true)
    onStart({ repoId, model, provider })
  }

  return (
    <div className="w-[320px] p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-1">
        <h3 className="text-[12px] font-medium text-foreground">Start work</h3>
        <p className="text-[11px] text-muted-foreground/60 leading-snug line-clamp-2">{task.title}</p>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Repository</label>
          <Select value={repoId || "none"} onValueChange={(v) => setRepoId(v === "none" ? "" : v)}>
            <SelectTrigger className={cn("h-8 text-[12px] rounded-lg", !repoId && "border-red-500/50")}>
              <SelectValue placeholder="Select repo..." />
            </SelectTrigger>
            <SelectContent>
              {repos.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Model</label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-8 text-[12px] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Sonnet 4.6" className="text-xs">Sonnet 4.6</SelectItem>
                <SelectItem value="Opus 4.6" className="text-xs">Opus 4.6</SelectItem>
                <SelectItem value="Haiku 4.5" className="text-xs">Haiku 4.5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Provider</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="h-8 text-[12px] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude" className="text-xs">Claude</SelectItem>
                <SelectItem value="claude-interactive" className="text-xs">Claude (Interactive)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleStart}
          disabled={!repoId || starting}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
            repoId && !starting
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "bg-muted text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          {starting ? <IconLoader2 size={12} className="animate-spin" /> : <IconPlayerPlay size={12} />}
          {starting ? "Starting..." : "Start"}
        </button>
      </div>
    </div>
  )
}

// ── Mock data removed — using server API ─────────────────────────────────────


// ── Droppable Column ─────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  onTaskClick,
}: {
  column: (typeof COLUMNS)[number]
  tasks: TaskItem[]
  onTaskClick: (task: TaskItem) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] shrink-0">
      <div className="flex items-center gap-2 px-2.5 py-1.5 mb-0.5">
        <div className={cn("w-2 h-2 rounded-full", column.dotClass)} />
        <span className="text-[12px] font-medium text-foreground">{column.label}</span>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-0 rounded-xl p-1 transition-colors",
          isOver && "bg-accent/30 ring-1 ring-accent"
        )}
      >
        <ScrollArea className="h-full">
          <div className="space-y-1 pr-0.5">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ── Draggable Card ───────────────────────────────────────────────────────────

function TaskCard({ task, onClick, isDragOverlay }: { task: TaskItem; onClick?: () => void; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: task,
  })

  const hasActiveAgent = task.agents.some(a => a.agentStatus === "in-progress")
  const firstAgent = task.agents[0]

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      onClick={onClick}
      className={cn(
        "relative bg-accent/40 border border-border/40 rounded-xl px-3 py-2.5 cursor-pointer hover:border-border hover:bg-accent/60 transition-all group overflow-hidden",
        isDragging && "opacity-30",
        isDragOverlay && "shadow-2xl ring-1 ring-foreground/10 rotate-1",
        hasActiveAgent && "border-l-2 border-l-amber-400"
      )}
    >
      {/* Top row: Jira key + sprint + priority */}
      <div className="flex items-center gap-2 mb-1">
        {task.jiraKey && (
          <span className="text-[10px] font-mono font-medium text-muted-foreground/60">{task.jiraKey}</span>
        )}
        {task.sprintName && (
          <span className="text-[9px] text-muted-foreground/40 truncate max-w-[100px]">{task.sprintName}</span>
        )}
        {task.priority && (
          <span className="ml-auto"><PriorityIcon priority={task.priority} size={11} /></span>
        )}
      </div>

      {/* Title */}
      <p className="text-[12px] font-medium text-foreground leading-snug line-clamp-2">{task.title}</p>

      {/* Bottom row: minimal — subtasks + agent status */}
      <div className="flex items-center gap-2 mt-2">
        {task.subtasks.length > 0 && (
          <div className="flex items-center gap-1">
            <IconChecklist size={11} className="text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/60">
              {task.subtasks.filter((s) => s.status === "done").length}/{task.subtasks.length}
            </span>
          </div>
        )}
        {firstAgent?.prNumber && (
          <div className="flex items-center gap-1">
            <IconGitPullRequest size={11} className={cn(
              firstAgent.prMerged ? "text-purple-400" :
              firstAgent.prDraft ? "text-muted-foreground/50" : "text-green-400"
            )} />
            <span className="text-[10px] text-muted-foreground/60">#{firstAgent.prNumber}</span>
          </div>
        )}
        {hasActiveAgent && (
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[9px] text-muted-foreground/50">Working</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Subtasks List ────────────────────────────────────────────────────────────

function SubtasksList({ subtasks, onSelect }: { subtasks: TaskItem[]; onSelect: (subtask: TaskItem) => void }) {
  const doneCount = subtasks.filter((s) => s.status === "done").length

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Subtasks</h3>
        {subtasks.length > 0 && (
          <>
            <span className="text-[10px] text-muted-foreground/40">{doneCount}/{subtasks.length}</span>
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(doneCount / subtasks.length) * 100}%` }} />
            </div>
          </>
        )}
      </div>
      {subtasks.length > 0 && (
        <div className="space-y-0.5">
          {subtasks.map((subtask) => {
            const col = COLUMNS.find((c) => c.id === subtask.status)
            return (
              <button
                key={subtask.id}
                onClick={() => onSelect(subtask)}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
              >
                <div className={cn("w-2 h-2 rounded-full shrink-0", col?.dotClass ?? "bg-muted-foreground/40")} />
                <span className={cn("text-xs flex-1 min-w-0 truncate", subtask.status === "done" ? "text-muted-foreground/40 line-through" : "text-foreground")}>
                  {subtask.title}
                </span>
                {subtask.agents.length > 0 && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {subtask.agents.map((a) => (
                      <div key={a.agentId} className={cn("w-1.5 h-1.5 rounded-full",
                        a.agentStatus === "done" ? "bg-emerald-500" : a.agentStatus === "in-review" ? "bg-blue-400" : a.agentStatus === "in-progress" ? "bg-amber-400" : "bg-muted-foreground/40"
                      )} />
                    ))}
                  </div>
                )}
                {subtask.jiraKey && (
                  <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0">{subtask.jiraKey}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared Task Content ──────────────────────────────────────────────────────

/** Walk a stack of nested TaskItems and rebuild from the bottom up with updates applied */
function applyNestedUpdate(stack: TaskItem[], updates: Partial<TaskItem>): TaskItem {
  if (stack.length === 0) throw new Error("empty stack")
  // Start from the deepest item (already updated)
  let child = { ...stack[stack.length - 1], ...updates }
  // Walk up the stack, replacing matching subtask at each level
  for (let i = stack.length - 2; i >= 0; i--) {
    const parent = stack[i]
    child = {
      ...parent,
      subtasks: parent.subtasks.map((s) => (s.id === child.id ? child : s)),
    }
  }
  return child
}

// ── Full-screen Task View ─────────────────────────────────────────────────────

function TaskFullView({ task, onBack, onUpdate, onDelete, onStartWork, queryClient }: {
  task: TaskItem
  onBack: () => void
  onUpdate: (updated: TaskItem) => void
  onDelete: () => void
  onStartWork: (task: TaskItem) => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [stackIds, setStackIds] = useState<string[]>([task.id])
  const [chatOpen, setChatOpen] = useState(false)
  const jiraHost = useJiraHost()

  useEffect(() => {
    setStackIds([task.id])
  }, [task.id])

  function findItem(items: TaskItem[], id: string): TaskItem | null {
    for (const item of items) {
      if (item.id === id) return item
      const found = findItem(item.subtasks, id)
      if (found) return found
    }
    return null
  }

  const current = findItem([task], stackIds[stackIds.length - 1]) ?? task

  const handleFieldUpdate = useCallback(async (updates: Partial<TaskItem>) => {
    const updated = { ...current, ...updates }
    // Apply nested update to root
    const stack = stackIds.map((id) => findItem([task], id) ?? task)
    const newStack = [...stack.slice(0, -1), updated]
    const updatedRoot = applyNestedUpdate(newStack, updates)
    onUpdate(updatedRoot)
    const result = await api.updateTask(current.id, {
      title: updates.title,
      description: updates.description,
      status: updates.status,
      priority: updates.priority,
      assignee: updates.assignee,
    })
    queryClient.setQueryData(["tasks"], result)
  }, [current, stackIds, task, onUpdate, queryClient])

  const handleAddSubtask = useCallback(async (parentId: string, title: string) => {
    const result = await api.createTask({ title, parentId })
    queryClient.setQueryData(["tasks"], result)
  }, [queryClient])

  const handleReply = useCallback(async (taskId: string, content: string): Promise<string | null> => {
    const result = await api.replyToTaskAgent(taskId, content)
    queryClient.setQueryData(["tasks"], result.tasks)
    if (result.agentId) {
      queryClient.invalidateQueries({ queryKey: ["agent", result.agentId] })
    }
    return result.agentId ?? null
  }, [queryClient])

  // Breadcrumb path
  const breadcrumbs = stackIds.map((id) => findItem([task], id)).filter(Boolean) as TaskItem[]

  return (
    <div className="flex flex-col h-full">
      {/* Sheet header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 shrink-0">
        {current.jiraKey && (
          <a
            href={`https://${jiraHost}/browse/${current.jiraKey}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalClick}
            className="text-[11px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
          >
            {current.jiraKey}
          </a>
        )}
        {/* Breadcrumbs for subtask navigation */}
        {breadcrumbs.length > 1 && (
          <div className="flex items-center gap-1 text-[11px] min-w-0">
            {breadcrumbs.slice(0, -1).map((item, i) => (
              <span key={item.id} className="flex items-center gap-1">
                <button
                  onClick={() => setStackIds((prev) => prev.slice(0, i + 1))}
                  className="text-muted-foreground/40 hover:text-foreground transition-colors truncate max-w-[100px]"
                >
                  {item.jiraKey ?? item.title}
                </button>
                <span className="text-muted-foreground/20">/</span>
              </span>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-accent transition-colors">
              <IconTrash size={13} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3" sideOffset={4}>
            <p className="text-[12px] text-foreground font-medium mb-1">Delete task?</p>
            <p className="text-[11px] text-muted-foreground mb-3">This cannot be undone.</p>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" size="xs">Cancel</Button>
              <Button variant="destructive" size="xs" onClick={onDelete}>Delete</Button>
            </div>
          </PopoverContent>
        </Popover>
        <button
          onClick={onBack}
          className="p-1 rounded text-muted-foreground/30 hover:text-foreground hover:bg-accent transition-colors"
        >
          <IconX size={14} />
        </button>
      </div>

      {/* Task content */}
      <div className="flex-1 min-h-0 relative">
        <TaskContentPanel
          item={current}
          onUpdate={handleFieldUpdate}
          onAddSubtask={handleAddSubtask}
          onSelectSubtask={(s) => setStackIds((prev) => [...prev, s.id])}
          onStartWork={() => onStartWork(current)}
        />

        {/* Ask AI floating button */}
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="absolute bottom-4 right-4 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-purple-600 text-white shadow-xl hover:bg-purple-500 transition-all text-[12px] font-medium"
          >
            <IconSparkles size={14} />
            Ask AI
          </button>
        )}

        {/* Chat bubble */}
        {chatOpen && (
          <div className="absolute bottom-3 left-3 right-3 h-[320px] rounded-xl bg-card border border-border/40 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0">
              <IconSparkles size={12} className="text-purple-400" />
              <span className="text-[11px] font-medium text-foreground flex-1">Discuss: {current.jiraKey ?? current.title}</span>
              <button
                onClick={() => setChatOpen(false)}
                className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
              >
                <IconX size={12} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <TaskChatPanel
                item={current}
                onReply={(content) => handleReply(current.id, content)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Task Content Panel (left side) ───────────────────────────────────────────

function TaskContentPanel({ item, onUpdate, onAddSubtask, onSelectSubtask, onStartWork }: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
  onAddSubtask: (parentId: string, title: string) => void
  onSelectSubtask: (s: TaskItem) => void
  onStartWork?: () => void
}) {
  const navigate = useNavigate()
  const { data: repos = [] } = useRepos()
  const columnDef = COLUMNS.find((c) => c.id === item.status)
  const jiraHost = useJiraHost()
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [descDraft, setDescDraft] = useState(item.description ?? "")
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("")

  // Sync drafts when item changes
  useEffect(() => {
    setTitleDraft(item.title)
    setDescDraft(item.description ?? "")
    setEditingTitle(false)
    setEditingDesc(false)
    setAddingSubtask(false)
  }, [item.id])

  const commitTitle = () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== item.title) {
      onUpdate({ title: trimmed })
    }
    setEditingTitle(false)
  }

  const commitDesc = () => {
    const val = descDraft.trim()
    if (val !== (item.description ?? "")) {
      onUpdate({ description: val || null })
    }
    setEditingDesc(false)
  }

  const addSubtask = () => {
    const trimmed = newSubtaskTitle.trim()
    if (!trimmed) return
    onAddSubtask(item.id, trimmed)
    setNewSubtaskTitle("")
    setAddingSubtask(false)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="px-5 py-4 space-y-4 max-w-2xl">
      {/* Title — click to edit */}
      {editingTitle ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitleDraft(item.title); setEditingTitle(false) } }}
          className="text-sm font-semibold text-foreground leading-snug bg-transparent border-b border-ring outline-none w-full"
        />
      ) : (
        <h2
          onClick={() => setEditingTitle(true)}
          className="text-sm font-semibold text-foreground leading-snug cursor-text hover:bg-accent/30 rounded px-1 -mx-1 transition-colors"
        >
          {item.title}
        </h2>
      )}

      {/* Properties — Linear-style rows */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-3 py-1">
          <span className="text-muted-foreground/50 w-16 shrink-0">Status</span>
          <Select value={item.status} onValueChange={(v) => onUpdate({ status: v as TaskColumn })}>
            <SelectTrigger className="h-6 px-2 text-xs gap-1.5 border-0 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none">
              <div className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", columnDef?.dotClass ?? "bg-muted-foreground/40")} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {COLUMNS.map((col) => (
                <SelectItem key={col.id} value={col.id} className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-2 h-2 rounded-full", col.dotClass)} />
                    {col.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {item.priority && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-muted-foreground/50 w-16 shrink-0">Priority</span>
            <div className="flex items-center gap-1.5 px-2">
              <PriorityIcon priority={item.priority} size={12} />
              <span className="text-foreground">{PRIORITY_CONFIG[item.priority]?.label ?? item.priority}</span>
            </div>
          </div>
        )}
        {item.assignee && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-muted-foreground/50 w-16 shrink-0">Assignee</span>
            <span className="text-foreground px-2">{item.assignee}</span>
          </div>
        )}
        {item.projectKey && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-muted-foreground/50 w-16 shrink-0">Project</span>
            <span className="text-foreground font-mono px-2">{item.projectKey}</span>
          </div>
        )}
        {item.sprintName && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-muted-foreground/50 w-16 shrink-0">Sprint</span>
            <span className="text-foreground px-2">{item.sprintName}</span>
          </div>
        )}
        {item.jiraKey && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-muted-foreground/50 w-16 shrink-0">Jira</span>
            <a
              href={`https://${jiraHost}/browse/${item.jiraKey}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalClick}
              className="flex items-center gap-1.5 px-2 text-foreground font-mono hover:text-primary transition-colors"
            >
              {item.jiraKey}
              <IconExternalLink size={10} className="text-muted-foreground/40" />
            </a>
          </div>
        )}
        {/* Repo assignment */}
        <div className="flex items-center gap-3 py-1">
          <span className="text-muted-foreground/50 w-16 shrink-0">Repo</span>
          <Select value={item.repoId ?? "none"} onValueChange={(v) => onUpdate({ repoId: v === "none" ? null : v } as any)}>
            <SelectTrigger className="h-6 px-2 text-xs gap-1.5 border-0 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none">
              <SelectValue placeholder="Select repo..." />
            </SelectTrigger>
            <SelectContent>
              {repos.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Linked agents */}
      {item.agents.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Agents</h3>
          <div className="space-y-1">
            {item.agents.map((a) => (
              <button
                key={a.agentId}
                onClick={() => navigate({ to: "/agent/$agentId", params: { agentId: a.agentId } })}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border/40 hover:bg-accent/30 transition-colors text-left"
              >
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  a.agentStatus === "done" ? "bg-emerald-500" :
                  a.agentStatus === "in-review" ? "bg-blue-400" :
                  a.agentStatus === "in-progress" ? "bg-amber-400" : "bg-muted-foreground/40"
                )} />
                <span className="text-[12px] text-foreground truncate flex-1">{a.agentTitle}</span>
                {a.prNumber && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono">#{a.prNumber}</span>
                )}
                {a.ciStatus === "passing" && <IconCheck size={11} className="text-emerald-400 shrink-0" />}
                {a.ciStatus === "failing" && <IconCircleX size={11} className="text-red-400 shrink-0" />}
                {a.ciStatus === "pending" && <IconLoader2 size={10} className="text-muted-foreground/40 animate-spin shrink-0" />}
                <IconExternalLink size={10} className="text-muted-foreground/30 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Start work button */}
      {item.agents.length === 0 && onStartWork && (
        <button
          onClick={onStartWork}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/40 hover:bg-accent/30 transition-colors text-[12px] font-medium text-foreground"
        >
          <IconPlayerPlay size={13} className="text-emerald-400" />
          Start work
        </button>
      )}

      {/* Description — click to edit */}
      <div className="space-y-1.5">
        <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Description</h3>
        {editingDesc ? (
          <textarea
            ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px" } }}
            autoFocus
            value={descDraft}
            onChange={(e) => { setDescDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px" }}
            onBlur={commitDesc}
            onKeyDown={(e) => { if (e.key === "Escape") { setDescDraft(item.description ?? ""); setEditingDesc(false) } }}
            rows={1}
            className="w-full text-xs text-foreground leading-relaxed bg-transparent border border-ring rounded-md px-2 py-1.5 outline-none resize-none overflow-hidden"
          />
        ) : (
          <div
            onClick={() => setEditingDesc(true)}
            className="cursor-text hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors min-h-[24px]"
          >
            {item.description ? (
              <div className="text-xs text-muted-foreground leading-relaxed prose prose-xs prose-invert prose-p:my-1 prose-li:my-0.5 prose-headings:text-foreground prose-headings:text-xs prose-headings:mt-2 prose-headings:mb-1 prose-code:text-[11px] prose-code:bg-accent prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-strong:text-foreground max-w-none">
                <ReactMarkdown>{item.description}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/30 italic">Add a description...</p>
            )}
          </div>
        )}
      </div>

      {/* Subtasks */}
      <div className="space-y-1">
        <SubtasksList subtasks={item.subtasks} onSelect={onSelectSubtask} />
        <button
          onClick={() => setAddingSubtask(true)}
          className={cn(
            "flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/30 transition-colors w-auto text-left",
            addingSubtask && "hidden"
          )}
        >
          <IconPlus size={11} />
          Add subtask
        </button>
        {addingSubtask && (
          <div className="rounded-xl border border-border/40 bg-accent/20 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className={cn("w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0")} />
              <input
                autoFocus
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newSubtaskTitle.trim()) addSubtask(); if (e.key === "Escape") { setNewSubtaskTitle(""); setAddingSubtask(false) } }}
                placeholder="Issue title"
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/30 outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/20">
              <button
                onClick={() => { setNewSubtaskTitle(""); setAddingSubtask(false) }}
                className="px-2.5 py-1 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addSubtask}
                disabled={!newSubtaskTitle.trim()}
                className={cn(
                  "px-3 py-1 rounded-md text-[11px] font-medium transition-colors",
                  newSubtaskTitle.trim()
                    ? "bg-accent text-foreground hover:bg-accent/80"
                    : "bg-muted/50 text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                Create
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Linked Agents */}
      {item.agents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Agents</h3>
          <div className="space-y-1.5">
            {item.agents.map((agent) => (
              <div key={agent.agentId} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border/40">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  agent.agentStatus === "done" ? "bg-emerald-500" :
                  agent.agentStatus === "in-review" ? "bg-blue-400" :
                  agent.agentStatus === "in-progress" ? "bg-amber-400" : "bg-muted-foreground/40"
                )} />
                <span className="text-xs text-foreground font-medium">{agent.agentTitle}</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto truncate max-w-[140px]">{agent.agentBranch}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments timeline */}
      {item.comments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Activity</h3>
          <div className="space-y-2">
            {item.comments.map((comment) => (
              <div key={comment.id} className="flex gap-2.5">
                <div className={cn(
                  "w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-medium mt-0.5",
                  comment.role === "ai" ? "bg-purple-500/15 text-purple-400" : "bg-accent text-muted-foreground"
                )}>
                  {comment.role === "ai" ? <IconSparkles size={10} /> : comment.author[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-medium text-foreground">{comment.role === "ai" ? "AI" : comment.author}</span>
                    <span className="text-[10px] text-muted-foreground/30">{new Date(comment.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="text-[12px] text-muted-foreground leading-relaxed prose prose-xs prose-invert prose-p:my-0.5 max-w-none">
                    <ReactMarkdown>{comment.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ── Task Chat Panel (right side) ─────────────────────────────────────────────

function TaskChatPanel({ item, onReply }: {
  item: TaskItem
  onReply: (content: string) => Promise<string | null>
}) {
  const [localAgentId, setLocalAgentId] = useState<string | null>(item.refineAgentId ?? null)
  const agentId = localAgentId ?? item.refineAgentId ?? null

  useEffect(() => {
    setLocalAgentId(item.refineAgentId ?? null)
  }, [item.id, item.refineAgentId])

  const { data: refineAgent, isStreaming, loadMore, hasMore, isLoadingMore } = useAgent(agentId)

  // Wrap onReply to capture the agentId for immediate subscription
  const handleReply = useCallback(async (content: string) => {
    const newAgentId = await onReply(content)
    if (newAgentId) setLocalAgentId(newAgentId)
  }, [onReply])

  // Before the refine agent exists, show an empty state with a prompt
  if (!refineAgent) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
            <IconSparkles size={20} className="text-purple-400" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Discuss this task</p>
            <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[280px]">Ask questions, discuss scope, or let AI help refine the requirements</p>
          </div>
        </div>
        {/* Minimal input to start the conversation */}
        <div className="shrink-0 px-5 py-4">
          <RefinementStartInput onSend={handleReply} />
        </div>
      </div>
    )
  }

  // Once the agent exists, render the full ChatView
  return (
    <div className="h-full">
      <ChatView
        agent={refineAgent}
        isStreaming={isStreaming}
        loadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        openFileTab={null}
        onClearFileTab={() => {}}
        hideChrome
      />
    </div>
  )
}

/** Minimal input shown before a refine agent exists */
function RefinementStartInput({ onSend }: { onSend: (content: string) => void }) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || sending) return
    setValue("")
    setSending(true)
    onSend(trimmed)
  }

  return (
    <div className="border border-border/40 rounded-xl px-4 py-3">
      <textarea
        value={value}
        onChange={(e) => { setValue(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px" }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
        placeholder="Ask a question or reply..."
        rows={1}
        disabled={sending}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none resize-none overflow-hidden disabled:opacity-50"
      />
      <div className="flex items-center justify-end mt-2">
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || sending}
          className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30"
        >
          {sending ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />}
        </button>
      </div>
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────────────────────

export function TasksView({ initialTaskId }: { initialTaskId?: string } = {}) {
  const { sidebarCollapsed } = useAppContext()
  const queryClient = useQueryClient()
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.getTasks(),
  })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId ?? null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskDesc, setNewTaskDesc] = useState("")
  const [newTaskRepoId, setNewTaskRepoId] = useState<string>("")
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("backlog")
  const { data: repos = [] } = useRepos()
  const [syncing, setSyncing] = useState(false)
  const [activeSprintOnly, setActiveSprintOnly] = useState(false)
  const [boardChatOpen, setBoardChatOpen] = useState(false)
  const [startWorkTask, setStartWorkTask] = useState<TaskItem | null>(null)

  // Listen for real-time task events via WebSocket
  useAgentEvents(null, useCallback((event) => {
    if (event.type === "task:comment" || event.type === "task:updated") {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    }
  }, [queryClient]))

  // Filter tasks: active sprint = tasks where sprint state is "active"
  const filteredTasks = useMemo(() => {
    if (!activeSprintOnly) return tasks
    function matches(item: TaskItem): boolean {
      if (item.sprintState === "active") return true
      return item.subtasks.some(matches)
    }
    return tasks.filter(matches)
  }, [tasks, activeSprintOnly])

  const hasSprintData = tasks.some((t) => t.sprintName)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const setTasks = useCallback((updater: (prev: TaskItem[]) => TaskItem[]) => {
    queryClient.setQueryData<TaskItem[]>(["tasks"], (prev) => updater(prev ?? []))
  }, [queryClient])

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }, [])

  const handleStartWork = useCallback(async (task: TaskItem, opts: { repoId: string; model: string; provider: string }) => {
    setStartWorkTask(null)
    try {
      const result = await api.startTaskWork(task.id, opts)
      queryClient.setQueryData(["tasks"], result.tasks)
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      const { toast } = await import("sonner")
      toast.success("Agent started", { description: task.title })
    } catch (err) {
      const { toast } = await import("sonner")
      toast.error((err as Error).message || "Failed to start work")
    }
  }, [queryClient])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return

    const taskId = active.id as string
    const newStatus = over.id as TaskColumn

    if (!COLUMNS.some((c) => c.id === newStatus)) return

    // Intercept drag to In Progress: show start work popover if no agent
    if (newStatus === "in-progress") {
      const task = tasks.find(t => t.id === taskId)
      if (task && task.agents.length === 0) {
        setStartWorkTask(task)
        return
      }
    }

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    )
    // Persist locally
    api.updateTask(taskId, { status: newStatus }).then((updated) => {
      queryClient.setQueryData(["tasks"], updated)
    })
    // Also push to Jira if task has a key
    const task = tasks.find((t) => t.id === taskId)
    if (task?.jiraKey) {
      const jiraStatus = COLUMN_TO_JIRA[newStatus]
      if (jiraStatus) api.transitionTask(taskId, jiraStatus)
    }
  }, [setTasks, queryClient])

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return
    await api.createTask({
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim() || undefined,
      status: newTaskStatus,
      repoId: newTaskRepoId || undefined,
    })
    queryClient.invalidateQueries({ queryKey: ["tasks"] })
    setNewTaskTitle("")
    setNewTaskDesc("")
    setNewTaskRepoId("")
    setNewTaskStatus("backlog")
    setAddingTask(false)
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null

  const handleDeleteTask = async (taskId: string) => {
    setSelectedTaskId(null)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    try {
      await api.deleteTask(taskId)
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    } catch {}
  }

  // Kanban board + optional detail sheet overlay
  return (
    <div className="relative flex flex-col h-full w-full">
      {/* Header — matches agent workspace header height for traffic light alignment */}
      <div className={cn("flex items-center gap-3 px-4 py-1.5 shrink-0", isTauri && "min-h-12", sidebarCollapsed && isTauri && "pl-32")}>
        <h1 className="text-[13px] font-medium text-foreground">Tasks</h1>
        <span className="text-[11px] text-muted-foreground/40">{filteredTasks.length}</span>
      </div>

      {/* Board panel */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-1 pt-0">
          <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-card border border-border/40 overflow-hidden">
            {/* Toolbar: filters + actions */}
            <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-border/30">
              {hasSprintData && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setActiveSprintOnly(false)}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-md transition-colors",
                      !activeSprintOnly
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    All issues
                  </button>
                  <button
                    onClick={() => setActiveSprintOnly(true)}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-md transition-colors",
                      activeSprintOnly
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    Active sprint
                  </button>
                </div>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setAddingTask(true)}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <IconPlus size={12} />
                New task
              </button>
              <Button
                variant="ghost"
                size="xs"
                onClick={async () => {
                  setSyncing(true)
                  try {
                    const result = await api.syncTasks()
                    if ("error" in result) {
                      const { toast } = await import("sonner")
                      toast.error(result.error)
                    } else {
                      queryClient.setQueryData(["tasks"], result)
                    }
                  } finally {
                    setSyncing(false)
                  }
                }}
                disabled={syncing}
                title="Sync from Jira"
              >
                <IconRefresh size={13} className={syncing ? "animate-spin" : ""} />
                Sync
              </Button>
            </div>

          {/* New task dialog */}
          <Dialog open={addingTask} onOpenChange={(open) => { if (!open) { setAddingTask(false); setNewTaskTitle(""); setNewTaskDesc("") } }}>
            <DialogContent>
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-2.5">
                <DialogTitle>New task</DialogTitle>
                <DialogClose className="ml-auto p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors">
                  <IconX size={14} />
                </DialogClose>
              </div>

              {/* Title */}
              <div className="px-4">
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newTaskTitle.trim()) void handleCreateTask()
                  }}
                  placeholder="Task title"
                  className="w-full bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground/30 outline-none"
                />
              </div>

              {/* Description */}
              <div className="px-4 pt-2 pb-3">
                <textarea
                  value={newTaskDesc}
                  onChange={(e) => { setNewTaskDesc(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(200, e.target.scrollHeight) + "px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newTaskTitle.trim()) void handleCreateTask()
                  }}
                  placeholder="Add description..."
                  rows={1}
                  className="w-full bg-transparent text-[13px] text-muted-foreground placeholder:text-muted-foreground/20 outline-none resize-none overflow-hidden"
                />
              </div>

              {/* Properties row */}
              <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/30">
                <Select value={newTaskStatus} onValueChange={(v) => setNewTaskStatus(v as TaskStatus)}>
                  <SelectTrigger className="h-7 px-2 text-[11px] gap-1 border border-border/40 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none rounded-md">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-2 h-2 rounded-full", COLUMNS.find(c => c.id === newTaskStatus)?.dotClass ?? "bg-muted-foreground/40")} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((col) => (
                      <SelectItem key={col.id} value={col.id} className="text-xs">
                        <div className="flex items-center gap-1.5"><div className={cn("w-2 h-2 rounded-full", col.dotClass)} />{col.label}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {repos.length > 0 && (
                  <Select value={newTaskRepoId || "none"} onValueChange={(v) => setNewTaskRepoId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-7 px-2 text-[11px] gap-1 border border-border/40 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none rounded-md">
                      <SelectValue placeholder="Repo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">No repo</SelectItem>
                      {repos.map((r) => (
                        <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground/30 mr-auto">⌘Enter to create</span>
                <button
                  onClick={handleCreateTask}
                  disabled={!newTaskTitle.trim()}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                    newTaskTitle.trim()
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  Create task
                </button>
              </div>
            </DialogContent>
          </Dialog>

            {/* Columns */}
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <IconLoader2 size={20} className="text-muted-foreground/40 animate-spin" />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
                <div className="flex gap-1.5 h-full min-w-min p-2">
                  {COLUMNS.map((col) => (
                    <KanbanColumn
                      key={col.id}
                      column={col}
                      tasks={filteredTasks.filter((t) => t.status === col.id)}
                      onTaskClick={(task) => setSelectedTaskId(task.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      {/* Start work dialog */}
      <Dialog open={!!startWorkTask} onOpenChange={(open) => { if (!open) setStartWorkTask(null) }}>
        <DialogContent className="max-w-[360px] p-0">
          {startWorkTask && (
            <StartWorkPopover
              task={startWorkTask}
              repos={repos}
              onStart={(opts) => handleStartWork(startWorkTask, opts)}
              onClose={() => setStartWorkTask(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Ask AI */}
      {!selectedTask && (
        <div className="absolute bottom-4 right-4 z-20">
          {boardChatOpen && (
            <div className="absolute bottom-12 right-0 w-[380px] h-[420px] rounded-xl bg-card border border-border/40 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0 bg-card">
                <IconSparkles size={12} className="text-purple-400" />
                <span className="text-[11px] font-medium text-foreground flex-1">Ask AI about your tasks</span>
                <button
                  onClick={() => setBoardChatOpen(false)}
                  className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
                >
                  <IconX size={12} />
                </button>
              </div>
              <div className="flex-1 min-h-0 bg-card">
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <IconSparkles size={18} className="text-purple-400" />
                  </div>
                  <p className="text-[12px] text-muted-foreground/60 leading-relaxed">Ask questions about your tasks, get suggestions, or discuss priorities</p>
                </div>
              </div>
              <div className="shrink-0 p-3 border-t border-border/30 bg-card">
                <RefinementStartInput onSend={() => {}} />
              </div>
            </div>
          )}
          <button
            onClick={() => setBoardChatOpen(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-full shadow-xl transition-all text-[12px] font-medium",
              boardChatOpen
                ? "bg-accent text-foreground border border-border/40"
                : "bg-purple-600 text-white hover:bg-purple-500"
            )}
          >
            <IconSparkles size={14} />
            Ask AI
          </button>
        </div>
      )}

      {/* Task detail sheet overlay */}
      {selectedTask && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => setSelectedTaskId(null)}
          />
          {/* Sheet */}
          <div className="fixed right-0 top-0 bottom-0 z-40 w-[480px] max-w-[90%] shadow-2xl border-l border-border/40 bg-card rounded-l-xl overflow-hidden animate-in slide-in-from-right duration-200">
            <TaskFullView
              task={selectedTask}
              onBack={() => setSelectedTaskId(null)}
              onUpdate={(updated) => {
                setTasks((p) => p.map((t) => (t.id === updated.id ? updated : t)))
              }}
              onDelete={() => handleDeleteTask(selectedTask.id)}
              onStartWork={(t) => setStartWorkTask(t)}
              queryClient={queryClient}
            />
          </div>
        </>
      )}
    </div>
  )
}
