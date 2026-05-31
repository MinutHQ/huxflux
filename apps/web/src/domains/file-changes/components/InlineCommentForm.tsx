import { forwardRef } from "react"
import { cn } from "@huxflux/ui"
import { IconMessagePlus, IconX } from "@tabler/icons-react"

interface InlineCommentFormProps {
  fileName: string
  lineNumber: number
  text: string
  onChangeText: (next: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/** Inline composer for adding a comment to a specific line of a diff. */
export const InlineCommentForm = forwardRef<HTMLTextAreaElement, InlineCommentFormProps>(
  function InlineCommentForm({ fileName, lineNumber, text, onChangeText, onSubmit, onCancel }, ref) {
    const canSubmit = !!text.trim()
    return (
      <div className="mx-2 my-1 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/20">
          <IconMessagePlus size={12} className="text-muted-foreground/50 shrink-0" />
          <span className="text-[11px] text-muted-foreground/70 font-mono">
            {fileName}:{lineNumber}
          </span>
          <button
            onClick={onCancel}
            className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <IconX size={12} />
          </button>
        </div>
        <div className="p-2.5">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmit()
              }
              if (e.key === "Escape") onCancel()
            }}
            placeholder="Add a comment about this line..."
            rows={2}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-muted-foreground/30">⌘Enter to add</span>
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className={cn(
                "px-3 py-1 rounded-md text-[11px] font-medium transition-colors",
                canSubmit
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-muted text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              Add to chat
            </button>
          </div>
        </div>
      </div>
    )
  },
)
