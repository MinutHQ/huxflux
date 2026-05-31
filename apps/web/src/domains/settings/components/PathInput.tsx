import { useRef, useState, type ChangeEvent } from "react"
import { api } from "@huxflux/shared"
import { IconFolder } from "@tabler/icons-react"

interface PathInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function PathInput({ value, onChange, placeholder, autoFocus }: PathInputProps) {
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([])
  const [showDrop, setShowDrop] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function fetchDirs(val: string) {
    const lastSlash = val.lastIndexOf("/")
    const browseDir = lastSlash >= 0 ? val.slice(0, lastSlash + 1) : val
    api.repos.browseFs(browseDir || undefined)
      .then(({ dirs: d }) => { setDirs(d); setShowDrop(true) })
      .catch(() => {})
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    onChange(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchDirs(v), 250)
  }

  const lastSegment = value.split("/").pop()?.toLowerCase() ?? ""
  const filtered = dirs
    .filter((d) => !lastSegment || d.name.toLowerCase().startsWith(lastSegment))
    .slice(0, 10)

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => { if (value) fetchDirs(value) }}
        onBlur={() => setTimeout(() => setShowDrop(false), 150)}
        placeholder={placeholder}
        className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
      {showDrop && filtered.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map((d) => (
            <button
              key={d.path}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(d.path); setShowDrop(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
            >
              <IconFolder size={12} className="text-muted-foreground/50 shrink-0" />
              <div className="min-w-0">
                <div className="text-[12px] text-foreground truncate">{d.name}</div>
                <div className="text-[11px] text-muted-foreground/50 font-mono truncate">{d.path}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
