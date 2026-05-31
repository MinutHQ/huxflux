import { useState } from "react"
import {
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@huxflux/ui"
import { IconX } from "@tabler/icons-react"
import { api, useRepos, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import { COLUMNS } from "../../config"
import type { TaskColumn } from "../../tasks.types"

/**
 * Dialog-based new-task composer. Renders as a centered modal with title /
 * description editors and inline status + repo selectors. The legacy inline
 * row was replaced by this dialog so the create flow matches the rest of
 * the app's modal conventions.
 */
export function NewTaskInput({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { data: repos = [] } = useRepos()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<TaskColumn>("backlog")
  const [repoId, setRepoId] = useState<string>("")

  const reset = () => {
    setTitle("")
    setDescription("")
    setStatus("backlog")
    setRepoId("")
  }

  const handleClose = () => {
    onClose()
    reset()
  }

  const createTask = useHuxfluxMutation<unknown, { title: string; description?: string; status: TaskColumn; repoId?: string }>({
    mutationFn: (body) => api.tasks.create(body),
    invalidate: () => queryKeys.tasks.list(),
    onSuccess: () => handleClose(),
  })

  const create = () => {
    if (!title.trim()) return
    createTask.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      repoId: repoId || undefined,
    })
  }

  const submitOnCmdEnter = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && title.trim()) {
      void create()
    }
  }

  const statusCol = COLUMNS.find((c) => c.id === status)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent>
        <div className="flex items-center gap-2 px-4 py-2.5">
          <DialogTitle>New task</DialogTitle>
          <DialogClose className="ml-auto p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors">
            <IconX size={14} />
          </DialogClose>
        </div>

        <div className="px-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={submitOnCmdEnter}
            placeholder="Task title"
            className="w-full bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground/30 outline-none"
          />
        </div>

        <div className="px-4 pt-2 pb-3">
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              e.target.style.height = "auto"
              e.target.style.height = Math.min(200, e.target.scrollHeight) + "px"
            }}
            onKeyDown={submitOnCmdEnter}
            placeholder="Add description..."
            rows={1}
            className="w-full bg-transparent text-[13px] text-muted-foreground placeholder:text-muted-foreground/20 outline-none resize-none overflow-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/30">
          <Select value={status} onValueChange={(v) => setStatus(v as TaskColumn)}>
            <SelectTrigger className="h-7 px-2 text-[11px] gap-1 border border-border/40 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none rounded-md">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    statusCol?.dotClass ?? "bg-muted-foreground/40",
                  )}
                />
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
          {repos.length > 0 && (
            <Select
              value={repoId || "none"}
              onValueChange={(v) => setRepoId(v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-7 px-2 text-[11px] gap-1 border border-border/40 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none rounded-md">
                <SelectValue placeholder="Repo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">No repo</SelectItem>
                {repos.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground/30 mr-auto">
            Cmd+Enter to create
          </span>
          <button
            onClick={create}
            disabled={!title.trim()}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
              title.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            Create task
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
