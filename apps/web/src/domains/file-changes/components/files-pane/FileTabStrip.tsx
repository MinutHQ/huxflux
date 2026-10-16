import { cn } from "@huxflux/ui"
import { IconFile, IconX } from "@tabler/icons-react"
import { fileColor } from "../../utils"
import type { OpenFileTab } from "../../file-changes.types"

interface FileTabStripProps {
  tabs: OpenFileTab[]
  active: string | null
  dirty: ReadonlySet<string>
  onSelect: (path: string) => void
  onPin: (path: string) => void
  onClose: (path: string) => void
}

/** Open-file tabs in the Files header. Preview tabs are italic; dirty tabs show a dot until hovered. */
export function FileTabStrip({ tabs, active, dirty, onSelect, onPin, onClose }: FileTabStripProps) {
  return (
    <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((tab) => {
        const name = tab.path.split("/").pop() ?? tab.path
        const isActive = tab.path === active
        const isDirty = dirty.has(tab.path)
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            title={tab.path}
            onClick={() => onSelect(tab.path)}
            onDoubleClick={() => onPin(tab.path)}
            onAuxClick={(e) => { if (e.button === 1) onClose(tab.path) }}
            className={cn(
              "group flex items-center gap-1.5 h-6 pl-2 pr-1 rounded-md text-[12px] cursor-pointer shrink-0 max-w-[180px] transition-colors",
              isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <IconFile size={12} className={cn("shrink-0", fileColor(name))} />
            <span className={cn("truncate", tab.preview && "italic")}>{name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab.path) }}
              className="relative w-4 h-4 flex items-center justify-center rounded shrink-0 hover:bg-background/60"
              title={isDirty ? "Unsaved changes" : "Close"}
            >
              {isDirty && <span className="absolute w-1.5 h-1.5 rounded-full bg-foreground group-hover:hidden" />}
              <IconX size={11} className={cn(isDirty && "hidden group-hover:block")} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
