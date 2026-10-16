import { useState, type ReactNode } from "react"
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@huxflux/ui"
import { IconCheck, IconDots } from "@tabler/icons-react"

export interface PaneMenuItem {
  label: string
  icon?: ReactNode
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface PaneMenuProps {
  items: Array<PaneMenuItem | "separator">
  title?: string
}

/** The `⋯` overflow menu in a side-pane header. */
export function PaneMenu({ items, title = "More" }: PaneMenuProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" title={title}>
          <IconDots size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-52 p-1">
        {items.map((item, i) =>
          item === "separator" ? (
            <div key={`sep-${i}`} className="my-1 h-px bg-border" />
          ) : (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect() }}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-foreground rounded-md transition-colors",
                "hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent",
              )}
            >
              <span className="w-3.5 flex justify-center text-muted-foreground">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.checked && <IconCheck size={12} className="text-muted-foreground" />}
            </button>
          ),
        )}
      </PopoverContent>
    </Popover>
  )
}
