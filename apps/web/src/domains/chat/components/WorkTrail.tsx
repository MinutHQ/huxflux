import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconChevronDown, IconCircleCheckFilled } from "@tabler/icons-react"
import { describeWorkStep, formatWorkClock } from "../extract/workSteps"
import type { FinishedStep } from "../chat.types"
import { WorkStepIcon } from "./WorkStepIcon"

/** How many finished steps show while the trail is folded. */
const folded = 3
const foldedOpacity = [1, 0.72, 0.45]

/** Every step the turn has already taken, newest first, each with how long it took. */
export function WorkTrail({ done, total }: { done: FinishedStep[]; total: number }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? done : done.slice(0, folded)
  return (
    <div className="py-1 border-t border-foreground/10">
      <div className={cn(expanded && done.length > 8 && "max-h-[260px] overflow-y-auto")}>
        {shown.map((item, i) => (
          <TrailRow key={item.step.call.id} item={item} opacity={expanded ? 1 : foldedOpacity[i] ?? 1} />
        ))}
      </div>
      {done.length > folded && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1 px-3 py-1.5 text-[10.5px] font-semibold text-foreground/80 hover:text-foreground transition-colors"
        >
          {expanded ? "Show fewer" : `Show all ${total} steps`}
          <IconChevronDown size={11} className={cn("transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  )
}

function TrailRow({ item, opacity }: { item: FinishedStep; opacity: number }) {
  const label = describeWorkStep(item.step.call)
  return (
    // the fold fade sits on a wrapper: the rise animation ends at full opacity and would override it
    <div style={{ opacity }}>
      <div className="work-rise flex items-center gap-2 pl-2 pr-3 py-[3px] min-w-0">
        <span className="w-[22px] flex justify-center shrink-0">
          <IconCircleCheckFilled size={11} className="text-foreground/70" />
        </span>
        <WorkStepIcon kind={label.kind} size={10} className="w-3.5 shrink-0 text-muted-foreground/60" />
        {label.verb && <span className="text-[10.5px] font-semibold text-muted-foreground shrink-0">{label.verb}</span>}
        <span className={cn("truncate min-w-0 text-muted-foreground/60", label.code ? "font-mono text-[10.5px]" : "text-[11px]")}>
          {label.text}
        </span>
        <span className="ml-auto pl-2 shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground/50">
          {item.took === null ? "" : item.took < 1000 ? "<1s" : formatWorkClock(Math.floor(item.took / 1000))}
        </span>
      </div>
    </div>
  )
}
