import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconChevronRight, IconFileText } from "@tabler/icons-react"

export function AgentPromptBlock({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-0.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0 text-muted-foreground/40", open && "rotate-90")} />
        <IconFileText size={12} className="text-muted-foreground/50 shrink-0" />
        <span className="text-muted-foreground/70">Prompt</span>
      </button>
      {open && (
        <div className="mt-1 rounded-lg overflow-hidden border border-border/60">
          <div className="bg-card/60 px-3 py-2.5 overflow-x-auto">
            <pre className="text-[11px] font-mono text-foreground/70 leading-relaxed whitespace-pre-wrap break-words">{prompt}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
