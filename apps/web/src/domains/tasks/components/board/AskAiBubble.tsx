// Floating "Ask AI" chat bubble on the kanban board. Placeholder surface
// for board-level AI assistance; today the panel is a stub that mirrors
// the design in main but doesn't yet wire up to a backend agent. The
// composer is intentionally a no-op until that surface lands.

import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconSparkles, IconX } from "@tabler/icons-react"
import { RefinementStartInput } from "../full-view/RefinementStartInput"

export function AskAiBubble() {
  const [open, setOpen] = useState(false)

  return (
    <div className="absolute bottom-4 right-4 z-20">
      {open && (
        <div className="absolute bottom-12 right-0 w-[380px] h-[420px] rounded-xl bg-card border border-border/40 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0 bg-card">
            <IconSparkles size={12} className="text-purple-400" />
            <span className="text-[11px] font-medium text-foreground flex-1">
              Ask AI about your tasks
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
            >
              <IconX size={12} />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-card">
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <IconSparkles size={18} className="text-purple-400" />
              </div>
              <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
                Ask questions about your tasks, get suggestions, or discuss priorities
              </p>
            </div>
          </div>
          <div className="shrink-0 p-3 border-t border-border/30 bg-card">
            <RefinementStartInput onSend={() => {}} />
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 px-4 py-2.5 rounded-full shadow-xl transition-all text-[12px] font-medium",
          open
            ? "bg-accent text-foreground border border-border/40"
            : "bg-purple-600 text-white hover:bg-purple-500",
        )}
      >
        <IconSparkles size={14} />
        Ask AI
      </button>
    </div>
  )
}
