import { useState } from "react"
import { IconPlus } from "@tabler/icons-react"

export function AddSubtaskInput({
  parentId,
  onAdd,
}: {
  parentId: string
  onAdd: (parentId: string, title: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onAdd(parentId, trimmed)
    setDraft("")
    setAdding(false)
  }

  if (adding) {
    return (
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        <div className="w-2 h-2 rounded-full bg-muted-foreground/20 shrink-0" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") {
              setDraft("")
              setAdding(false)
            }
          }}
          onBlur={() => {
            if (!draft.trim()) setAdding(false)
          }}
          placeholder="Subtask title..."
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none"
        />
        <span className="text-[9px] text-muted-foreground/30 shrink-0">↵</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => setAdding(true)}
      className="flex items-center gap-2 px-1.5 py-1 rounded-md text-[11px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/30 transition-colors w-full text-left"
    >
      <IconPlus size={11} />
      Add subtask
    </button>
  )
}
