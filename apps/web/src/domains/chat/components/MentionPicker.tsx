import React from "react"
import { MentionRow } from "./MentionRow"

interface MentionOption {
  type: "file" | "terminal"
  name: string
  path: string
}

interface MentionPickerProps {
  agentId: string
  options: MentionOption[]
  activeIndex: number
  onSelect: (opt: MentionOption) => void
  listRef?: React.Ref<HTMLDivElement>
  activeRef?: React.Ref<HTMLDivElement>
}

export function MentionPicker({ agentId, options, activeIndex, onSelect, listRef, activeRef }: MentionPickerProps) {
  if (options.length === 0) return null
  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10">
      <div className="px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Files & Context</span>
      </div>
      <div ref={listRef} className="max-h-52 overflow-y-auto">
        {options.map((opt, i) => (
          <MentionRow
            key={opt.type === "terminal" ? "__terminal__" : opt.path}
            option={opt}
            agentId={agentId}
            isActive={i === activeIndex}
            onSelect={() => onSelect(opt)}
            rowRef={i === activeIndex ? activeRef : undefined}
          />
        ))}
      </div>
    </div>
  )
}
