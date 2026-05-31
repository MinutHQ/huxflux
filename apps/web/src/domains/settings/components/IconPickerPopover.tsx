import { useState, type RefObject } from "react"
import { AnchoredPopover, cn } from "@huxflux/ui"
import { IconSearch } from "@tabler/icons-react"
import { ICON_CATEGORIES, getTablerIcon } from "../utils"

interface IconPickerPopoverProps {
  selectedIcon: string
  onSelect: (icon: string) => void
  onClose: () => void
  anchorRef: RefObject<HTMLButtonElement | null>
}

export function IconPickerPopover({ selectedIcon, onSelect, onClose, anchorRef }: IconPickerPopoverProps) {
  const [search, setSearch] = useState("")

  const filtered = ICON_CATEGORIES.map((cat) => ({
    ...cat,
    icons: cat.icons.filter((name) => !search || name.toLowerCase().includes(search.toLowerCase())),
  })).filter((cat) => cat.icons.length > 0)

  return (
    <AnchoredPopover anchorRef={anchorRef} onClose={onClose} className="w-72 overflow-hidden">
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-2 bg-background rounded-lg border border-border px-2.5 py-1.5">
          <IconSearch size={12} className="text-muted-foreground/50 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[12px] bg-transparent outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 space-y-3">
        {filtered.map((cat) => (
          <div key={cat.label}>
            <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider px-1 mb-1.5">{cat.label}</div>
            <div className="grid grid-cols-9 gap-1">
              {cat.icons.map((iconName) => {
                const IconComp = getTablerIcon(iconName)
                if (!IconComp) return null
                const isSelected = selectedIcon === iconName
                return (
                  <button
                    key={iconName}
                    title={iconName.replace(/^Icon/, "")}
                    onClick={() => { onSelect(isSelected ? "" : iconName); onClose() }}
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <IconComp size={14} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-4 text-center text-[12px] text-muted-foreground/40">No icons found</div>
        )}
      </div>
      {selectedIcon && (
        <div className="border-t border-border p-2">
          <button
            onClick={() => { onSelect(""); onClose() }}
            className="w-full text-[12px] text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Remove icon
          </button>
        </div>
      )}
    </AnchoredPopover>
  )
}
