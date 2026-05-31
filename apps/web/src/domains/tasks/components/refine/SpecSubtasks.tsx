import { useState } from "react"
import { Button } from "@huxflux/ui"
import { IconCircleCheck, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import type { Repo } from "@huxflux/shared"
import type { RefineSession } from "../../tasks.types"

export function SpecSubtasks({
  session,
  selectedRepos,
  onUpdate,
}: {
  session: RefineSession
  selectedRepos: Repo[]
  onUpdate: (s: RefineSession) => void
}) {
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [subtaskDraft, setSubtaskDraft] = useState("")

  function removeSubtask(id: string) {
    onUpdate({ ...session, subtasks: session.subtasks.filter((t) => t.id !== id) })
  }

  function saveSubtask(id: string) {
    onUpdate({
      ...session,
      subtasks: session.subtasks.map((t) =>
        t.id === id ? { ...t, title: subtaskDraft.trim() || t.title } : t,
      ),
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

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
          Subtasks
        </span>
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
          <div
            key={task.id}
            className="group/task rounded-lg border border-border bg-card text-sm overflow-hidden"
          >
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
                  <Button
                    size="sm"
                    className="h-6 text-[11px] px-2.5"
                    onClick={() => saveSubtask(task.id)}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setEditingSubtaskId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 px-3 py-2">
                <IconCircleCheck
                  size={14}
                  className="text-muted-foreground/30 shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground block w-fit mb-0.5">
                    {task.repoName}
                  </span>
                  <span className="text-foreground leading-snug">{task.title}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => {
                      setEditingSubtaskId(task.id)
                      setSubtaskDraft(task.title)
                    }}
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
  )
}
