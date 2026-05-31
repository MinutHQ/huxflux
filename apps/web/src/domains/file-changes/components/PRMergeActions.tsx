import { useState } from "react"
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@huxflux/ui"
import { IconCheck, IconChevronDown } from "@tabler/icons-react"
import type { MergeMethod } from "../file-changes.types"

const METHODS = ["squash", "merge", "rebase"] as const

interface PRMergeActionsProps {
  isDraft: boolean
  isMergeable: boolean
  markingReady: boolean
  merging: boolean
  onMarkReady: () => void
  onMerge: (method: MergeMethod) => void
}

/** Action bar at the bottom of the AgentPRTab: Mark Ready or the merge dropdown. */
export function PRMergeActions({
  isDraft,
  isMergeable,
  markingReady,
  merging,
  onMarkReady,
  onMerge,
}: PRMergeActionsProps) {
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash")
  const [bypassRules, setBypassRules] = useState(false)
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false)

  if (isDraft) {
    return (
      <Button size="sm" className="w-full text-[12px]" onClick={onMarkReady} disabled={markingReady}>
        {markingReady ? "Marking ready..." : "Mark ready for review"}
      </Button>
    )
  }

  const disabled = merging || (!isMergeable && !bypassRules)

  return (
    <div className="space-y-2">
      {!isMergeable && (
        <button
          onClick={() => setBypassRules(!bypassRules)}
          className="flex items-center gap-2 text-[11px] text-red-400/80 cursor-pointer select-none"
        >
          <div
            className={cn(
              "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
              bypassRules ? "bg-red-400 border-red-400" : "border-muted-foreground/30",
            )}
          >
            {bypassRules && <IconCheck size={10} className="text-background" />}
          </div>
          Merge without waiting for requirements (bypass rules)
        </button>
      )}
      <div className="flex items-center">
        <Button size="sm" className="text-[12px] flex-1 rounded-r-none" onClick={() => onMerge(mergeMethod)} disabled={disabled}>
          {merging ? "Merging..." : `${mergeMethod.charAt(0).toUpperCase() + mergeMethod.slice(1)} merge`}
        </Button>
        <Popover open={mergeMenuOpen} onOpenChange={setMergeMenuOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-1.5" disabled={disabled}>
              <IconChevronDown size={12} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1" sideOffset={4}>
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => { setMergeMethod(m); setMergeMenuOpen(false) }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors",
                  mergeMethod === m && "font-medium text-foreground",
                )}
              >
                {mergeMethod === m && <IconCheck size={12} />}
                <span className={mergeMethod !== m ? "pl-5" : ""}>
                  {m.charAt(0).toUpperCase() + m.slice(1)} merge
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
