import { IconChevronRight, IconSearch } from "@tabler/icons-react"

interface FileSearchBarProps {
  value: string
  onChange: (next: string) => void
}

/** Inline file search input used in the All / Diff views. */
export function FileSearchBar({ value, onChange }: FileSearchBarProps) {
  return (
    <div className="flex items-center gap-1.5 mx-2.5 mb-1.5 bg-muted/50 rounded-md px-2 py-1 border border-transparent focus-within:border-border transition-colors">
      <IconSearch size={12} className="text-muted-foreground/40 shrink-0" />
      <input
        type="text"
        placeholder="Search files..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/40"
      />
      {value && (
        <button onClick={() => onChange("")} className="text-muted-foreground/40 hover:text-muted-foreground">
          <IconChevronRight size={10} className="rotate-45" />
        </button>
      )}
    </div>
  )
}
