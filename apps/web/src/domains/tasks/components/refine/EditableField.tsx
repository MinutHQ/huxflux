import { useEffect, useRef, useState } from "react"
import { Button } from "@huxflux/ui"
import { IconPencil } from "@tabler/icons-react"

export function EditableField({
  label,
  value,
  onSave,
  multiline = true,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  function commit() {
    onSave(draft.trim())
    setEditing(false)
  }
  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  return (
    <div className="space-y-1.5 group/field">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
          {label}
        </span>
        {!editing && (
          <button
            onClick={() => {
              setDraft(value)
              setEditing(true)
            }}
            className="opacity-0 group-hover/field:opacity-100 transition-opacity text-muted-foreground/40 hover:text-muted-foreground"
          >
            <IconPencil size={11} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1.5">
          {multiline ? (
            <textarea
              ref={ref as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel()
              }}
              rows={3}
              className="w-full text-sm bg-muted/50 border border-border rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:border-ring"
            />
          ) : (
            <input
              ref={ref as React.RefObject<HTMLInputElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit()
                if (e.key === "Escape") cancel()
              }}
              className="w-full text-sm bg-muted/50 border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-ring"
            />
          )}
          <div className="flex gap-1.5">
            <Button size="sm" className="h-6 text-[11px] px-2.5" onClick={commit}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] px-2"
              onClick={cancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p
          className="text-sm text-foreground leading-relaxed cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 transition-colors"
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
        >
          {value || <span className="text-muted-foreground/40 italic">Empty — click to edit</span>}
        </p>
      )}
    </div>
  )
}
