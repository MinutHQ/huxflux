import { useRef, useState, type KeyboardEvent } from "react"
import { cn } from "@huxflux/ui"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"

interface ReviewPromptInputProps {
  value: string
  loading: boolean
  onChange: (value: string) => void
  saved: boolean
}

export function ReviewPromptInput({ value, loading, onChange, saved }: ReviewPromptInputProps) {
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: slashCommands = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.slashCommandsGlobal(slashQuery),
    queryFn: () => api.agents.slashCommands(undefined, slashQuery ?? undefined),
    enabled: slashQuery !== null,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  function handleChange(text: string) {
    onChange(text)
    const lastLine = text.split("\n").pop() ?? ""
    if (lastLine.startsWith("/")) {
      setSlashQuery(lastLine.slice(1))
      setSlashIndex(0)
    } else {
      setSlashQuery(null)
    }
  }

  function applySlashCommand(name: string) {
    const lines = value.split("\n")
    lines[lines.length - 1] = `/${name} `
    onChange(lines.join("\n"))
    setSlashQuery(null)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashQuery === null || slashCommands.length === 0) return
    if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashCommands.length) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashCommands.length) % slashCommands.length) }
    else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applySlashCommand(slashCommands[slashIndex].name) }
    else if (e.key === "Escape") setSlashQuery(null)
  }

  return (
    <div>
      <div className="text-sm font-medium text-foreground mb-1">Review prompt</div>
      <div className="text-[13px] text-muted-foreground mb-3 leading-snug">
        Custom instructions injected into every AI code review. Type <code className="text-xs bg-muted px-1 py-0.5 rounded">/</code> to insert a skill inline.
      </div>
      <div className="relative">
        {slashQuery !== null && slashCommands.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10">
            <div className="px-3 py-1.5 border-b border-border/60">
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Skills</span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {slashCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  onMouseDown={(e) => { e.preventDefault(); applySlashCommand(cmd.name) }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                    i === slashIndex ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <span className="text-[12px] font-mono font-semibold text-foreground/80 shrink-0 w-28 truncate">/{cmd.name}</span>
                  <span className="text-[11px] text-muted-foreground/60 flex-1 truncate">{cmd.description}</span>
                  {cmd.source === "skill" && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">skill</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={loading ? "" : value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={"Focus on security and performance.\nAlways check for missing error handling.\n\n/my-review-checklist"}
          rows={10}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
      </div>
      <div className="text-[11px] text-muted-foreground/60 mt-1.5 h-4">
        {saved ? "Saved" : ""}
      </div>
    </div>
  )
}
