import type { ChangeEvent, RefObject } from "react"
import { IconFolder, IconLoader2, IconSearch, IconX } from "@tabler/icons-react"

export interface RepoResult { name: string; path: string }

interface SearchModeProps {
  query: string
  loading: boolean
  filtered: RepoResult[]
  selected: RepoResult | null
  showResults: boolean
  searchRef: RefObject<HTMLInputElement | null>
  onQueryChange: (e: ChangeEvent<HTMLInputElement>) => void
  onSelect: (r: RepoResult) => void
  onClearSelection: () => void
  onShow: () => void
  onSwitchToManual: () => void
}

/** Typeahead repo picker. The default mode of `AddRepoDialog` for git repos. */
export function SearchMode({
  query, loading, filtered, selected, showResults, searchRef,
  onQueryChange, onSelect, onClearSelection, onShow, onSwitchToManual,
}: SearchModeProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Repository</label>
        <button
          type="button"
          onClick={onSwitchToManual}
          className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          Enter path manually
        </button>
      </div>
      <div className="relative">
        <div className="relative">
          <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
          <input
            ref={searchRef}
            autoFocus
            type="text"
            value={query}
            onChange={onQueryChange}
            onFocus={onShow}
            placeholder="Search for a git repository…"
            className="w-full text-sm bg-background border border-input rounded-md pl-8 pr-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
          {loading && (
            <IconLoader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 animate-spin" />
          )}
        </div>

        {showResults && filtered.length > 0 && !selected && (
          <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto">
            {filtered.slice(0, 20).map((r) => (
              <button
                key={r.path}
                type="button"
                onClick={() => onSelect(r)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
              >
                <IconFolder size={13} className="text-muted-foreground/50 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-foreground font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground/60 font-mono truncate">{r.path}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {showResults && !loading && filtered.length === 0 && query.trim() && !selected && (
          <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl px-3 py-4 text-center">
            <span className="text-[13px] text-muted-foreground">No repositories found</span>
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-md bg-secondary">
          <IconFolder size={12} className="text-muted-foreground/50 shrink-0" />
          <code className="text-[11px] font-mono text-muted-foreground truncate flex-1">{selected.path}</code>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
          >
            <IconX size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

interface ManualModeProps {
  manualPath: string
  manualName: string
  /** Folder mode is path-only; hide the "Search instead" link to avoid implying git scan. */
  allowSwitchToSearch: boolean
  onPathChange: (v: string) => void
  onNameChange: (v: string) => void
  onSwitchToSearch: () => void
}

/** Free-form path + name. Used for non-discoverable git roots and for folder repos. */
export function ManualMode({
  manualPath, manualName, allowSwitchToSearch, onPathChange, onNameChange, onSwitchToSearch,
}: ManualModeProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Path</label>
        {allowSwitchToSearch && (
          <button
            type="button"
            onClick={onSwitchToSearch}
            className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            Search instead
          </button>
        )}
      </div>
      <input
        autoFocus
        type="text"
        value={manualPath}
        onChange={(e) => onPathChange(e.target.value)}
        placeholder="/home/user/projects/my-repo"
        className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
      <div>
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Name</label>
        <input
          type="text"
          value={manualName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={manualPath.trim().split("/").pop() || "my-repo"}
          className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
        />
      </div>
    </div>
  )
}

interface BranchFromFieldProps { value: string; onChange: (v: string) => void; loading: boolean }

/** "Branch from" input under the path picker (git mode only). */
export function BranchFromField({ value, onChange, loading }: BranchFromFieldProps) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Branch from</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="origin/main"
          className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
        />
        {loading && (
          <IconLoader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 animate-spin" />
        )}
      </div>
    </div>
  )
}
