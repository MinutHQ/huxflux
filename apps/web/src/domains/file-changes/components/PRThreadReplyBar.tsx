import { useState } from "react"
import { Button } from "@huxflux/ui"
import type { PRThread } from "@huxflux/shared"

interface PRThreadReplyBarProps {
  thread: PRThread
  onResolve: () => void
  onReply: (commentId: number, body: string) => Promise<void>
}

/** Footer of a PR thread: shows Reply / Resolve actions, expands into a reply input when activated. */
export function PRThreadReplyBar({ thread, onResolve, onReply }: PRThreadReplyBarProps) {
  const [isReplying, setIsReplying] = useState(false)
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const last = thread.comments[thread.comments.length - 1]
    if (!last || !text.trim()) return
    setSubmitting(true)
    try {
      await onReply(last.databaseId ?? 0, text.trim())
      setIsReplying(false)
      setText("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border/30 bg-muted/20">
      {isReplying ? (
        <div className="flex-1 flex items-center gap-1.5">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() }
              if (e.key === "Escape") setIsReplying(false)
            }}
            placeholder="Reply..."
            className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-ring"
            disabled={submitting}
          />
          <Button size="xs" onClick={submit} disabled={submitting || !text.trim()} className="text-[10px]">Send</Button>
          <Button variant="ghost" size="xs" onClick={() => setIsReplying(false)} className="text-[10px]">Cancel</Button>
        </div>
      ) : (
        <>
          <button
            onClick={() => { setIsReplying(true); setText("") }}
            className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
          >
            Reply
          </button>
          {!thread.isResolved && (
            <button
              onClick={onResolve}
              className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
            >
              Resolve
            </button>
          )}
        </>
      )}
    </div>
  )
}
