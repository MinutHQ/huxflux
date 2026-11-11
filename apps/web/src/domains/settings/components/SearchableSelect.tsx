import { useState } from "react"
import { cn, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconCheck, IconSelector } from "@tabler/icons-react"

interface SearchableSelectProps {
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  /** Shown in the list while options are still being fetched. */
  isLoading?: boolean
  /** Let Enter pick the typed text when nothing in the list matches. */
  allowCustom?: boolean
}

/** Select-styled trigger that opens a type-to-filter list. Arrow keys move, Enter picks. */
export function SearchableSelect({ value, options, onChange, placeholder = "Search...", isLoading, allowCustom }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [highlight, setHighlight] = useState(0)

  const query = search.trim().toLowerCase()
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query)) : options

  function handleOpenChange(next: boolean) {
    setOpen(next)
    setSearch("")
    setHighlight(Math.max(0, options.indexOf(value)))
  }

  function pick(option: string) {
    onChange(option)
    setOpen(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      const option = filtered[highlight]
      if (option) pick(option)
      else if (allowCustom && search.trim()) pick(search.trim())
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} className="flex w-full h-8 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/40 dark:hover:bg-input/60">
          <span className="truncate">{value}</span>
          <IconSelector size={16} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-(--radix-popover-trigger-width)" align="start">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setHighlight(0) }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoFocus
          className="w-full bg-transparent border-b border-border px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 mb-1"
        />
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((option, i) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              ref={i === highlight ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onClick={() => pick(option)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 text-sm rounded-md",
                i === highlight && "bg-muted-foreground/15",
                option === value && "font-medium",
              )}
            >
              <span className="truncate">{option}</span>
              {option === value && <IconCheck size={14} className="shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">{isLoading ? "Loading..." : allowCustom && search.trim() ? `Press Enter to use "${search.trim()}"` : "No matches"}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
