import { useState } from "react"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconX } from "@tabler/icons-react"

export function CloseTabButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-foreground transition-all"
        >
          <IconX size={11} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3" sideOffset={4} onClick={(e) => e.stopPropagation()}>
        <p className="text-[12px] text-foreground font-medium mb-1">Close tab?</p>
        <p className="text-[11px] text-muted-foreground mb-3">The conversation will be permanently deleted.</p>
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" size="xs" onClick={() => { setOpen(false); onConfirm() }}>Delete</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
