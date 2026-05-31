import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { IconFilter, IconX } from "@tabler/icons-react"
import { KEYBOARD_SHORTCUTS } from "./keyboardShortcuts"

/**
 * Modal opened by ⌘/ or via the help menu. Searches over the shortcut labels
 * and groups results by category. Escape closes (and stops propagation so a
 * keyboard handler higher up the tree doesn't double-fire).
 */
export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const filtered = KEYBOARD_SHORTCUTS.filter((s) =>
    !search || s.label.toLowerCase().includes(search.toLowerCase())
  )
  const groups = [...new Set(filtered.map((s) => s.group))]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-[480px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Keyboard shortcuts</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <IconX size={14} />
          </button>
        </div>
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2 bg-background rounded-lg border border-border px-3 py-1.5">
            <IconFilter size={13} className="text-muted-foreground/50 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search shortcuts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-muted-foreground/40">No shortcuts found</div>
          ) : groups.map((group) => (
            <div key={group}>
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{group}</span>
              </div>
              {filtered.filter((s) => s.group === group).map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 transition-colors">
                  <span className="text-[13px] text-foreground">{s.label}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((key, ki) => (
                      <kbd key={ki} className="px-1.5 py-0.5 rounded border border-border bg-background text-[11px] font-mono text-muted-foreground min-w-[24px] text-center">
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
