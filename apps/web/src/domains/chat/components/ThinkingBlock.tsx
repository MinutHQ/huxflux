import { useState } from "react"
import { IconWorld } from "@tabler/icons-react"

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.replace(/\s+/g, " ").trim()

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 text-left w-full group min-w-0"
      >
        <IconWorld size={13} className="text-muted-foreground/50 shrink-0 mt-0.5" />
        <span className="text-[12px] font-medium text-muted-foreground/70 shrink-0">Thinking</span>
        {!expanded && (
          <span className="text-[12px] text-muted-foreground/40 font-mono truncate ml-1 min-w-0 flex-1">{preview}</span>
        )}
      </button>
      {expanded && (
        <div className="mt-2 ml-5 bg-card/60 border border-border/60 rounded-lg px-4 py-3">
          <p className="text-[12px] font-mono text-muted-foreground/70 leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>
      )}
    </div>
  )
}
