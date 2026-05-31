import { useState } from "react"
import type { TaskItem } from "@huxflux/shared"
import ReactMarkdown from "react-markdown"

/**
 * Wraps the inline editor so a fresh `item.id` remounts and resets the
 * draft / editing state instead of needing an effect to sync them.
 */
export function TaskDescription({
  item,
  onUpdate,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
}) {
  return <TaskDescriptionEditor key={item.id} item={item} onUpdate={onUpdate} />
}

function TaskDescriptionEditor({
  item,
  onUpdate,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.description ?? "")

  const commit = () => {
    const val = draft.trim()
    if (val !== (item.description ?? "")) {
      onUpdate({ description: val || null })
    }
    setEditing(false)
  }

  return (
    <div className="space-y-1.5">
      <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Description
      </h3>
      {editing ? (
        <textarea
          ref={(el) => {
            if (el) {
              el.style.height = "auto"
              el.style.height = el.scrollHeight + "px"
            }
          }}
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = e.target.scrollHeight + "px"
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(item.description ?? "")
              setEditing(false)
            }
          }}
          rows={1}
          className="w-full text-xs text-foreground leading-relaxed bg-transparent border border-ring rounded-md px-2 py-1.5 outline-none resize-none overflow-hidden"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
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
  )
}
