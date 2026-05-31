import { useRef, useState } from "react"
import { cn, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconChevronDown } from "@tabler/icons-react"

interface BranchPickerProps {
  currentBranch: string
  highlightBranch?: string
  branches: string[]
  buttonClassName?: string
  buttonTitle?: string
  caretClassName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (branch: string) => void
}

export function BranchPicker({
  currentBranch,
  highlightBranch = currentBranch,
  branches,
  buttonClassName,
  buttonTitle,
  caretClassName = "opacity-50",
  open,
  onOpenChange,
  onSelect,
}: BranchPickerProps) {
  const [search, setSearch] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  function handleOpenChange(o: boolean) {
    onOpenChange(o)
    if (o) setSearch("")
  }

  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()))

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className={buttonClassName} title={buttonTitle}>
          {currentBranch}
          <IconChevronDown size={11} className={cn("shrink-0", caretClassName)} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onOpenChange(false)
            if (e.key === "Enter") {
              if (filtered.length === 1) onSelect(filtered[0])
              else if (search.trim()) onSelect(search.trim())
            }
          }}
          placeholder="Search branches…"
          autoFocus
          className="w-full bg-transparent border-b border-border px-2 py-1.5 text-[12px] font-mono outline-none placeholder:text-muted-foreground/50 mb-1"
        />
        <div className="max-h-48 overflow-y-auto">
          {filtered.map((b) => (
            <button
              key={b}
              onClick={() => onSelect(b)}
              className={cn(
                "w-full text-left px-2 py-1 text-[12px] font-mono rounded hover:bg-accent transition-colors",
                b === highlightBranch && "text-foreground font-medium"
              )}
            >
              {b}
            </button>
          ))}
          {branches.length === 0 && (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Loading branches…</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
