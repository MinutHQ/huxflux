import { useState } from "react"
import { IconLoader2, IconSend } from "@tabler/icons-react"

/** Minimal composer shown before a refine agent exists for the task. */
export function RefinementStartInput({
  onSend,
}: {
  onSend: (content: string) => void
}) {
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
        onChange={(e) => {
          setValue(e.target.value)
          e.target.style.height = "auto"
          e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
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
          {sending ? (
            <IconLoader2 size={14} className="animate-spin" />
          ) : (
            <IconSend size={14} />
          )}
        </button>
      </div>
    </div>
  )
}
