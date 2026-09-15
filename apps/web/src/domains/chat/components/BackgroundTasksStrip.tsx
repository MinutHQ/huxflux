import { useState } from "react"
import { IconChevronDown, IconEye, IconLoader2, IconPlayerStop, IconTerminal2 } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button, cn } from "@huxflux/ui"
import { api, useHuxfluxMutation, type BackgroundTask } from "@huxflux/shared"
import { useBackgroundState } from "../hooks/useBackgroundState"

interface BackgroundTasksStripProps {
  agentId: string
}

function TaskRow({ task }: { task: BackgroundTask }) {
  const Icon = task.kind === "monitor" ? IconEye : IconTerminal2
  const started = new Date(task.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon size={12} className="mt-0.5 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-snug text-foreground/80 truncate">
          {task.label}
          {task.persistent && <span className="ml-1.5 text-[10px] text-muted-foreground/50">persistent</span>}
        </div>
        {task.command && task.command !== task.label && (
          <div className="text-[11px] font-mono text-muted-foreground/60 truncate" title={task.command}>{task.command}</div>
        )}
      </div>
      <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">{started}</span>
    </div>
  )
}

/**
 * Shows the background work the CLI started this turn (Monitor watches,
 * background Bash) and, once the CLI has emitted its final result but is
 * still alive, says so and offers to end the turn. Ending the turn only
 * terminates the CLI; processes the agent started in the worktree survive.
 */
export function BackgroundTasksStrip({ agentId }: BackgroundTasksStripProps) {
  const { tasks, lingering } = useBackgroundState(agentId)
  const [collapsed, setCollapsed] = useState(false)
  const endTurn = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.agents.endTurn(agentId),
    onError: () => toast.error("Could not end the turn. The process may already have exited."),
  })

  if (tasks.length === 0 && !lingering) return null

  const title = lingering ? "Turn finished, CLI still running" : "Background tasks"
  const summary = tasks.length === 0
    ? "waiting on background work"
    : `${tasks.length} background task${tasks.length === 1 ? "" : "s"}`

  return (
    <div className="mx-2 mb-2 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 min-w-0 text-[11px] font-semibold text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <IconLoader2 size={12} className={cn("shrink-0", lingering ? "text-amber-400 animate-spin" : "text-muted-foreground/50 animate-spin")} />
          <span className="truncate">{title}</span>
          <span className="text-muted-foreground/40 font-mono ml-0.5 shrink-0">{summary}</span>
          <IconChevronDown size={11} className={cn("transition-transform ml-0.5 shrink-0", collapsed && "-rotate-90")} />
        </button>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto text-muted-foreground hover:text-foreground"
          disabled={endTurn.isPending}
          onClick={() => endTurn.mutate()}
          title="Terminate the CLI process only. Processes the agent started in the worktree keep running."
        >
          <IconPlayerStop size={12} />
          End turn
        </Button>
      </div>
      {!collapsed && tasks.length > 0 && (
        <div className="px-3 pb-2.5 space-y-1.5 border-t border-border/60 pt-2">
          {tasks.map((task) => <TaskRow key={task.toolUseId} task={task} />)}
        </div>
      )}
    </div>
  )
}
