import { useState } from "react"
import { cn, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconChevronDown } from "@tabler/icons-react"

interface BranchPickerProps {
  /** The currently-selected branch label rendered in the trigger. */
  current: string
  branches: string[]
  /** Active value for highlighting the active row in the list. Defaults to `current`. */
  activeValue?: string
  triggerClassName?: string
  contentClassName?: string
  /** Resolve a selection (either a clicked row or a typed-and-Enter'd value). */
  onSelect: (value: string) => void | Promise<void>
  /** Called when the popover opens; controlled outside via key — we reset state internally. */
  onOpenChange?: (open: boolean) => void
}

/** Branch-search popover with type-to-filter and Enter-to-pick. Used for both branch and base-branch. */
export function BranchPicker({
  current,
  branches,
  activeValue,
  triggerClassName,
  contentClassName = "w-64",
  onSelect,
  onOpenChange,
}: BranchPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const active = activeValue ?? current

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setSearch("")
    onOpenChange?.(next)
  }

  async function pick(value: string) {
    setOpen(false)
    setSearch("")
    await onSelect(value)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setOpen(false)
    if (e.key === "Enter") {
      const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()))
      if (filtered.length === 1) void pick(filtered[0])
      else if (search.trim()) void pick(search.trim())
    }
  }

  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()))

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className={cn("text-[11px] font-mono hover:text-foreground transition-colors flex items-center gap-0.5", triggerClassName)}>
          {current}
          <IconChevronDown size={9} className="opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-1", contentClassName)} align="start">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search branches..."
          autoFocus
          className="w-full bg-transparent border-b border-border px-2 py-1.5 text-[12px] font-mono outline-none placeholder:text-muted-foreground/50 mb-1"
        />
        <div className="max-h-48 overflow-y-auto">
          {filtered.map((b) => (
            <button
              key={b}
              onClick={() => void pick(b)}
              className={cn(
                "w-full text-left px-2 py-1 text-[12px] font-mono rounded hover:bg-accent transition-colors",
                b === active && "text-foreground font-medium",
              )}
            >
              {b}
            </button>
          ))}
          {branches.length === 0 && (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Loading branches...</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
