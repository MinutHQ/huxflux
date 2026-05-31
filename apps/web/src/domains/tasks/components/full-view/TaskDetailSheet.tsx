// Right-side sheet that hosts the task detail. The sheet itself is a
// fixed overlay with a click-to-dismiss backdrop; inside it the content
// panel reuses the existing editors (title / properties / description /
// subtasks) and a floating "Ask AI" bubble that opens an in-sheet refine
// chat. This replaces the legacy full-screen TaskFullView for the
// kanban-board → detail flow.

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@huxflux/ui"
import { IconSparkles, IconTrash, IconX } from "@tabler/icons-react"
import { handleExternalClick } from "@/lib/platform"
import { useJiraHost } from "../../hooks/useJiraHost"
import { useTaskFullView } from "../../hooks/useTaskFullView"
import { TaskChatPanel } from "./TaskChatPanel"
import { TaskContentPanel } from "./TaskContentPanel"

function SheetHeader({
  current,
  breadcrumbs,
  onNavigate,
  onDelete,
  onClose,
}: {
  current: TaskItem
  breadcrumbs: TaskItem[]
  onNavigate: (index: number) => void
  onDelete: () => void
  onClose: () => void
}) {
  const jiraHost = useJiraHost()
  return (
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
      {breadcrumbs.length > 1 && (
        <div className="flex items-center gap-1 text-[11px] min-w-0">
          {breadcrumbs.slice(0, -1).map((item, i) => (
            <span key={item.id} className="flex items-center gap-1">
              <button
                onClick={() => onNavigate(i)}
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
          <button
            className="p-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-accent transition-colors"
            title="Delete task"
          >
            <IconTrash size={13} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-3" sideOffset={4}>
          <p className="text-[12px] text-foreground font-medium mb-1">Delete task?</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            This cannot be undone.
          </p>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="xs">
              Cancel
            </Button>
            <Button variant="destructive" size="xs" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <button
        onClick={onClose}
        className="p-1 rounded text-muted-foreground/30 hover:text-foreground hover:bg-accent transition-colors"
        title="Close"
      >
        <IconX size={14} />
      </button>
    </div>
  )
}

function AskAiOverlay({
  item,
  onReply,
}: {
  item: TaskItem
  onReply: (content: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 right-4 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-purple-600 text-white shadow-xl hover:bg-purple-500 transition-all text-[12px] font-medium"
      >
        <IconSparkles size={14} />
        Ask AI
      </button>
    )
  }
  return (
    <div className="absolute bottom-3 left-3 right-3 h-[320px] rounded-xl bg-card border border-border/40 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0">
        <IconSparkles size={12} className="text-purple-400" />
        <span className="text-[11px] font-medium text-foreground flex-1">
          Discuss: {item.jiraKey ?? item.title}
        </span>
        <button
          onClick={() => setOpen(false)}
          className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
        >
          <IconX size={12} />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <TaskChatPanel item={item} onReply={onReply} />
      </div>
    </div>
  )
}

export function TaskDetailSheet({
  task,
  onClose,
  onUpdate,
  onRequestStartWork,
}: {
  task: TaskItem
  onClose: () => void
  onUpdate: (updated: TaskItem) => void
  onRequestStartWork: (task: TaskItem) => void
}) {
  const queryClient = useQueryClient()
  const {
    current,
    breadcrumbs,
    handleFieldUpdate,
    handleAddSubtask,
    handleReply,
    pushSubtask,
    navigateToCrumb,
  } = useTaskFullView({ task, onUpdate })

  const handleDelete = async () => {
    onClose()
    try {
      // fire-and-forget; intentional: delete returns the new task list which we seed directly into the cache
      // eslint-disable-next-line no-restricted-syntax
      const updated = await api.tasks.delete(task.id)
      queryClient.setQueryData(queryKeys.tasks.list(), updated)
    } catch {
      // Errors are reported via the global toast wiring on the server side;
      // closing the sheet is the right UX either way.
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 z-40 w-[480px] max-w-[90%] shadow-2xl border-l border-border/40 bg-card overflow-hidden flex flex-col animate-in slide-in-from-right duration-200">
        <SheetHeader
          current={current}
          breadcrumbs={breadcrumbs}
          onNavigate={navigateToCrumb}
          onDelete={handleDelete}
          onClose={onClose}
        />
        <div className="flex-1 min-h-0 relative">
          <TaskContentPanel
            item={current}
            onUpdate={handleFieldUpdate}
            onAddSubtask={handleAddSubtask}
            onSelectSubtask={pushSubtask}
            onStartWork={() => onRequestStartWork(current)}
          />
          <AskAiOverlay
            item={current}
            onReply={(content) => handleReply(current.id, content)}
          />
        </div>
      </div>
    </>
  )
}
