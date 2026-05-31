import { useState, useRef } from "react"
import { cn } from "@huxflux/ui"
import { IconArrowUp, IconLoader2 } from "@tabler/icons-react"

interface BuilderInputProps {
  onSend: (message: string) => void | Promise<void>
}

export function BuilderInput({ onSend }: BuilderInputProps) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = async () => {
    const trimmed = value.trim()
    if (!trimmed || sending) return
    setSending(true)
    setValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    await onSend(trimmed)
    setSending(false)
  }

  return (
    <div className="shrink-0 px-4 py-3">
      <div className="relative border border-border/40 rounded-2xl shadow-sm focus-within:shadow-md focus-within:border-ring/50 transition-all overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend() }
          }}
          placeholder="Describe what you want to automate..."
          rows={2}
          disabled={sending}
          className="w-full bg-transparent px-4 pt-3 pb-10 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none resize-none overflow-hidden disabled:opacity-50"
        />
        <div className="absolute bottom-2 right-2">
          <button
            onClick={handleSend}
            disabled={!value.trim() || sending}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              value.trim() && !sending
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            {sending ? <IconLoader2 size={14} className="animate-spin" /> : <IconArrowUp size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
