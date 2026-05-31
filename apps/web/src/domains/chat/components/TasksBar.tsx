import { useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconX,
} from "@tabler/icons-react"
import type { TodoItem } from "../chat.types"

interface TasksBarProps {
  todos: TodoItem[]
  agentId: string
  isStreaming?: boolean
}

function TodoRow({ todo }: { todo: TodoItem }) {
  return (
    <div className="flex items-start gap-2">
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
  )
}

export function TasksBar({ todos, agentId, isStreaming }: TasksBarProps) {
  const storageKey = `huxflux-tasks-dismissed-${agentId}`
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "true")

  function handleDismiss() {
    localStorage.setItem(storageKey, "true")
    setDismissed(true)
  }

  if (dismissed || todos.length === 0) return null

  const allDone = todos.every((t) => t.status === "completed")
  if (allDone && !isStreaming) return null

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
          {todos.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
        </div>
      )}
    </div>
  )
}
