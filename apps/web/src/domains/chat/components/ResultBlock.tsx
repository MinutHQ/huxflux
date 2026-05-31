import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconChevronDown } from "@tabler/icons-react"

export function ResultBlock({ result }: { result: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const lines = result.split("\n")

  return (
    <div className="mt-1.5 ml-4 rounded-lg overflow-hidden border border-border/60">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-secondary/40 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <span>{lines.length} lines</span>
        <IconChevronDown size={10} className={cn("transition-transform", collapsed && "-rotate-90")} />
      </button>
      {!collapsed && (
        <div className="bg-card/60 px-3 py-2 overflow-x-auto">
          <pre className="text-[11px] font-mono text-foreground/70 leading-relaxed whitespace-pre">{result}</pre>
        </div>
      )}
    </div>
  )
}
