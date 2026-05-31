import { cn } from "@huxflux/ui"
import type { SlashCommand } from "@huxflux/shared"

interface SlashCommandPickerProps {
  commands: SlashCommand[]
  activeIndex: number
  onSelect: (name: string) => void
}

export function SlashCommandPicker({ commands, activeIndex, onSelect }: SlashCommandPickerProps) {
  if (commands.length === 0) return null
  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10">
      <div className="px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Commands</span>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {commands.map((cmd, i) => (
          <button
            key={cmd.name}
            onMouseDown={(e) => { e.preventDefault(); onSelect(cmd.name) }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
              i === activeIndex ? "bg-accent" : "hover:bg-accent/50"
            )}
          >
            <span className="text-[12px] font-mono font-semibold text-foreground/80 shrink-0 w-24 truncate">/{cmd.name}</span>
            <span className="text-[11px] text-muted-foreground/60 leading-relaxed flex-1 truncate">{cmd.description}</span>
            {cmd.source === "skill" && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">skill</span>
            )}
            {cmd.args && (
              <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">{cmd.args}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
