import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconCheck } from "@tabler/icons-react"
import type { PendingQuestionEntry, PendingQuestionOption } from "../chat.types"
import type { QuestionDraft } from "@huxflux/shared"

interface QuestionOptionsProps {
  q: PendingQuestionEntry
  draft: QuestionDraft
  onChoose: (label: string) => void
  onOtherChange: (value: string) => void
  onEnter: () => void
}

const rowClass = "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors text-[12px]"

function rowState(active: boolean): string {
  return active ? "border-foreground/40 bg-accent text-foreground" : "border-border bg-card hover:bg-accent/60 text-foreground/80"
}

/** Radio dot for single-select, checkbox for multi-select. */
function Marker({ active, multi }: { active: boolean; multi: boolean }) {
  return (
    <div className={cn(
      "w-3.5 h-3.5 border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors",
      multi ? "rounded-[3px]" : "rounded-full",
      active ? "border-foreground bg-foreground" : "border-muted-foreground/40",
    )}>
      {active && (multi
        ? <IconCheck size={9} stroke={3} className="text-background" />
        : <div className="w-1.5 h-1.5 rounded-full bg-background" />)}
    </div>
  )
}

function OptionRow({ opt, index, active, multi, onChoose, onHover }: {
  opt: PendingQuestionOption
  index: number
  active: boolean
  multi: boolean
  onChoose: () => void
  onHover: (label: string | null) => void
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      onMouseEnter={() => onHover(opt.label)}
      onMouseLeave={() => onHover(null)}
      className={cn(rowClass, rowState(active))}
    >
      <Marker active={active} multi={multi} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{opt.label}</span>
        {opt.description && <span className="text-muted-foreground ml-1.5">{opt.description}</span>}
      </div>
      {index < 9 && <kbd className="text-[10px] font-mono text-muted-foreground/60 shrink-0 mt-0.5">{index + 1}</kbd>}
    </button>
  )
}

export function QuestionOptions({ q, draft, onChoose, onOtherChange, onEnter }: QuestionOptionsProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const options = q.options ?? []
  const multi = !!q.multiSelect
  const otherActive = draft.other.trim().length > 0
  // Preview of the hovered option, else of the most recently chosen one.
  const previewLabel = hovered ?? draft.selected[draft.selected.length - 1]
  const preview = options.find((o) => o.label === previewLabel)?.preview

  return (
    <div className="space-y-1">
      {options.map((opt, i) => (
        <OptionRow
          key={opt.label}
          opt={opt}
          index={i}
          active={draft.selected.includes(opt.label)}
          multi={multi}
          onChoose={() => onChoose(opt.label)}
          onHover={setHovered}
        />
      ))}
      <div className={cn(rowClass, rowState(otherActive))}>
        <Marker active={otherActive} multi={multi} />
        <input
          type="text"
          placeholder={multi ? "Something else (added to your picks)…" : "Other…"}
          value={draft.other}
          onChange={(e) => onOtherChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter() } }}
          className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
      </div>
      {preview && (
        <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] font-mono text-foreground/80 whitespace-pre">
          {preview}
        </pre>
      )}
    </div>
  )
}
