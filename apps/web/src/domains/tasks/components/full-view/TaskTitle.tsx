import { useState } from "react"
import type { TaskItem } from "@huxflux/shared"

/**
 * Wraps the inline editor so a fresh `item.id` remounts and resets the
 * draft / editing state instead of needing an effect to sync them.
 */
export function TaskTitle({
  item,
  onUpdate,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
}) {
  return <TaskTitleEditor key={item.id} item={item} onUpdate={onUpdate} />
}

function TaskTitleEditor({
  item,
  onUpdate,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.title) {
      onUpdate({ title: trimmed })
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") {
            setDraft(item.title)
            setEditing(false)
          }
        }}
        className="text-sm font-semibold text-foreground leading-snug bg-transparent border-b border-ring outline-none w-full"
      />
    )
  }

  return (
    <h2
      onClick={() => setEditing(true)}
      className="text-sm font-semibold text-foreground leading-snug cursor-text hover:bg-accent/30 rounded px-1 -mx-1 transition-colors"
    >
      {item.title}
    </h2>
  )
}
