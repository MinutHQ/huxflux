import { useState } from "react"
import { Button, cn } from "@huxflux/ui"
import { IconSend } from "@tabler/icons-react"
import type { RefineSession } from "../../tasks.types"

export function RefineInput({
  session,
  isTyping,
  onSend,
}: {
  session: RefineSession
  isTyping: boolean
  onSend: (text: string) => void
}) {
  const [input, setInput] = useState("")
  const inputDisabled =
    isTyping || session.status === "repos" || session.status === "done"

  const submit = () => {
    const text = input.trim()
    if (!text || inputDisabled) return
    setInput("")
    onSend(text)
  }

  return (
    <div className="p-3 shrink-0">
      <div
        className={cn(
          "bg-card rounded-xl border transition-colors",
          !inputDisabled && "focus-within:border-ring",
        )}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={inputDisabled}
          placeholder={
            session.status === "repos"
              ? "Select repos above first…"
              : session.status === "done"
                ? "Refinement complete"
                : "Answer…"
          }
          rows={2}
          className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="flex items-center justify-end px-3 pb-3">
          <Button
            size="icon-xs"
            variant={!inputDisabled && input.trim() ? "default" : "secondary"}
            disabled={inputDisabled || !input.trim()}
            onClick={submit}
          >
            <IconSend size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}
