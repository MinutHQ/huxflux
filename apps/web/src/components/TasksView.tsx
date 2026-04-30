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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import {
  IconRefresh,
  IconExternalLink,
  IconCircleDot,
  IconChecklist,
  IconArrowLeft,
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
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, useAgentEvents, useAgent, useRepos } from "@huxflux/shared"
import type { TaskItem, TaskStatus } from "@huxflux/shared"
import { useNavigate } from "@tanstack/react-router"
import ReactMarkdown from "react-markdown"
import { handleExternalClick } from "@/lib/platform"
import { ChatView } from "@/components/ChatView"
import { IconGitPullRequest, IconCheck, IconCircleX, IconPlayerPlay } from "@tabler/icons-react"

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
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div className="flex items-center gap-2 px-2 py-2 mb-1">
        <div className={cn("w-2 h-2 rounded-full", column.dotClass)} />
        <span className="text-xs font-medium text-foreground">{column.label}</span>
        <span className="text-[11px] text-muted-foreground/60 ml-auto">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-0 rounded-lg p-1 transition-colors space-y-1.5",
          isOver && "bg-accent/40"
        )}
      >
        <ScrollArea className="h-full">
          <div className="space-y-1.5 pr-1">
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

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-lg px-3 py-2.5 cursor-pointer hover:border-foreground/20 transition-colors group",
        isDragging && "opacity-30",
        isDragOverlay && "shadow-lg ring-1 ring-foreground/10 rotate-1"
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

      {/* Bottom row: subtasks + PR + CI + agents */}
      <div className="flex items-center gap-2 mt-2">
        {task.subtasks.length > 0 && (
          <div className="flex items-center gap-1">
            <IconChecklist size={11} className="text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/60">
              {task.subtasks.filter((s) => s.status === "done").length}/{task.subtasks.length}
            </span>
          </div>
        )}
        {task.comments.length > 0 && (
          <div className="flex items-center gap-1">
            <IconCircleDot size={11} className="text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/60">{task.comments.length}</span>
          </div>
        )}
        {/* PR status from first agent */}
        {task.agents.length > 0 && task.agents[0].prNumber && (
          <div className="flex items-center gap-1">
            <IconGitPullRequest size={11} className={cn(
              task.agents[0].prMerged ? "text-purple-400" :
              task.agents[0].prDraft ? "text-muted-foreground/50" : "text-green-400"
            )} />
            <span className="text-[10px] text-muted-foreground/60">#{task.agents[0].prNumber}</span>
          </div>
        )}
        {/* CI status */}
        {task.agents.length > 0 && task.agents[0].ciStatus && (
          task.agents[0].ciStatus === "passing" ? <IconCheck size={11} className="text-emerald-400" /> :
          task.agents[0].ciStatus === "failing" ? <IconCircleX size={11} className="text-red-400" /> :
          <IconLoader2 size={10} className="text-muted-foreground/40 animate-spin" />
        )}
        {/* Agent status dots */}
        {task.agents.length > 0 && (
          <div className="flex items-center gap-0.5 ml-auto">
            {task.agents.map((a) => (
              <div
                key={a.agentId}
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  a.agentStatus === "done" ? "bg-emerald-500" :
                  a.agentStatus === "in-review" ? "bg-blue-400" :
                  a.agentStatus === "in-progress" ? "bg-amber-400" : "bg-muted-foreground/40"
                )}
                title={`${a.agentTitle}: ${a.agentStatus}`}
              />
            ))}
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

function TaskFullView({ task, onBack, onUpdate, queryClient }: {
  task: TaskItem
  onBack: () => void
  onUpdate: (updated: TaskItem) => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [stackIds, setStackIds] = useState<string[]>([task.id])
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
    <div className="flex flex-col h-full w-full flex-1 min-w-0 bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <button onClick={onBack} className="text-muted-foreground/50 hover:text-foreground transition-colors">
          <IconArrowLeft size={14} />
        </button>
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-xs min-w-0">
          <button onClick={onBack} className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0">Tasks</button>
          {breadcrumbs.map((item, i) => (
            <span key={item.id} className="flex items-center gap-1 min-w-0">
              <span className="text-muted-foreground/30">/</span>
              {i < breadcrumbs.length - 1 ? (
                <button
                  onClick={() => setStackIds((prev) => prev.slice(0, i + 1))}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors truncate max-w-[120px]"
                >
                  {item.jiraKey ?? item.title}
                </button>
              ) : (
                <span className="text-foreground font-medium truncate">{item.jiraKey ?? item.title}</span>
              )}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        {current.jiraKey && (
          <a
            href={`https://${jiraHost}/browse/${current.jiraKey}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalClick}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors"
            title="Open in Jira"
          >
            {current.jiraKey}
            <IconExternalLink size={11} />
          </a>
        )}
      </div>

      {/* Main content: left = task details, right = chat */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize="50" minSize="30">
          <TaskContentPanel
            item={current}
            onUpdate={handleFieldUpdate}
            onAddSubtask={handleAddSubtask}
            onSelectSubtask={(s) => setStackIds((prev) => [...prev, s.id])}
            onStartWork={async () => {
              try {
                const result = await api.startTaskWork(current.id)
                queryClient.setQueryData(["tasks"], result.tasks)
                queryClient.invalidateQueries({ queryKey: ["agents"] })
              } catch (err) {
                const { toast } = await import("sonner")
                toast.error((err as Error).message || "Failed to start work")
              }
            }}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="50" minSize="25">
          <TaskChatPanel
            item={current}
            onReply={(content) => handleReply(current.id, content)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
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
          <div className="px-6 py-5 space-y-5 max-w-2xl">
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
          <Select value={item.repoId ?? ""} onValueChange={(v) => onUpdate({ repoId: v || null } as any)}>
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
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/50 bg-card hover:border-foreground/20 transition-colors text-left"
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
      {item.agents.length === 0 && item.repoId && onStartWork && (
        <button
          onClick={onStartWork}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-[12px] font-medium text-foreground"
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
        {addingSubtask ? (
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/20 shrink-0" />
            <input
              autoFocus
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); if (e.key === "Escape") { setNewSubtaskTitle(""); setAddingSubtask(false) } }}
              onBlur={() => { if (!newSubtaskTitle.trim()) setAddingSubtask(false) }}
              placeholder="Subtask title..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none"
            />
            <span className="text-[9px] text-muted-foreground/30 shrink-0">↵</span>
          </div>
        ) : (
          <button
            onClick={() => setAddingSubtask(true)}
            className="flex items-center gap-2 px-1.5 py-1 rounded-md text-[11px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/30 transition-colors w-full text-left"
          >
            <IconPlus size={11} />
            Add subtask
          </button>
        )}
      </div>

      {/* Linked Agents */}
      {item.agents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Agents</h3>
          <div className="space-y-1.5">
            {item.agents.map((agent) => (
              <div key={agent.agentId} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border">
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
      <div className="h-full flex flex-col border-l border-border">
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
    <div className="h-full border-l border-border">
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
    <div className="bg-card border border-border rounded-xl px-4 py-3">
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
  const queryClient = useQueryClient()
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.getTasks(),
  })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId ?? null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskRepoId, setNewTaskRepoId] = useState<string>("")
  const { data: repos = [] } = useRepos()
  const [syncing, setSyncing] = useState(false)
  const [activeSprintOnly, setActiveSprintOnly] = useState(false)

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

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return

    const taskId = active.id as string
    const newStatus = over.id as TaskColumn

    if (!COLUMNS.some((c) => c.id === newStatus)) return

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

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null

  // Full-screen task view when a task is selected
  if (selectedTask) {
    return (
      <TaskFullView
        task={selectedTask}
        onBack={() => setSelectedTaskId(null)}
        onUpdate={(updated) => {
          setTasks((p) => p.map((t) => (t.id === updated.id ? updated : t)))
        }}
        queryClient={queryClient}
      />
    )
  }

  // Kanban board
  return (
    <div className="flex h-full w-full bg-background">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
            <h1 className="text-sm font-semibold text-foreground">Tasks</h1>
            <span className="text-[11px] text-muted-foreground/50">{filteredTasks.length} items</span>
            {hasSprintData && (
              <button
                onClick={() => setActiveSprintOnly((v) => !v)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-md border transition-colors",
                  activeSprintOnly
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-card border-border text-muted-foreground/60 hover:text-foreground"
                )}
              >
                Active sprint
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => setAddingTask(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <IconPlus size={12} />
              New task
            </button>
            <button
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
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-50"
              title="Sync from Jira"
            >
              <IconRefresh size={13} className={syncing ? "animate-spin" : ""} />
              Sync
            </button>
          </div>

          {/* New task input */}
          {addingTask && (
            <div className="px-4 pb-2">
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newTaskTitle.trim()) {
                      await api.createTask({ title: newTaskTitle.trim(), repoId: newTaskRepoId || undefined })
                      queryClient.invalidateQueries({ queryKey: ["tasks"] })
                      setNewTaskTitle("")
                      setAddingTask(false)
                    }
                    if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle("") }
                  }}
                  placeholder="Task title..."
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40"
                />
                {repos.length > 0 && (
                  <select
                    value={newTaskRepoId}
                    onChange={(e) => setNewTaskRepoId(e.target.value)}
                    className="bg-transparent text-[11px] text-muted-foreground/60 outline-none border-0 cursor-pointer"
                  >
                    <option value="">No repo</option>
                    {repos.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={async () => {
                    if (!newTaskTitle.trim()) return
                    await api.createTask({ title: newTaskTitle.trim(), repoId: newTaskRepoId || undefined })
                    queryClient.invalidateQueries({ queryKey: ["tasks"] })
                    setNewTaskTitle("")
                    setAddingTask(false)
                  }}
                  disabled={!newTaskTitle.trim()}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => { setAddingTask(false); setNewTaskTitle("") }}
                  className="text-muted-foreground/40 hover:text-muted-foreground"
                >
                  <IconX size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Columns */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <IconLoader2 size={20} className="text-muted-foreground/40 animate-spin" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-2 p-4 h-full min-w-min">
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

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} isDragOverlay />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
