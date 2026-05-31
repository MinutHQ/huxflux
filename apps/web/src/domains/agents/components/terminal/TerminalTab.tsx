import { useEffect, useRef } from "react"
import { cn } from "@huxflux/ui"
import { IconTerminal2, IconX } from "@tabler/icons-react"
import type { TerminalTab as TerminalTabModel } from "../../agents.types"

interface TerminalTabProps {
  tab: TerminalTabModel
  displayLabel: string
  isActive: boolean
  isRenaming: boolean
  renameValue: string
  showClose: boolean
  onSelect: () => void
  onStartRename: () => void
  onRenameChange: (next: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onClose: () => void
}

/** A single tab pill in the terminal tab strip. Owns its rename input ref. */
export function TerminalTab({
  displayLabel,
  isActive,
  isRenaming,
  renameValue,
  showClose,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onClose,
}: TerminalTabProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [isRenaming])

  return (
    <div
      onClick={onSelect}
      onDoubleClick={(e) => { e.preventDefault(); onStartRename() }}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors cursor-pointer shrink-0",
        isActive
          ? "bg-accent text-foreground"
          : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
      )}
    >
      <IconTerminal2 size={12} className="shrink-0" />
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit()
            if (e.key === "Escape") onRenameCancel()
            e.stopPropagation()
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent outline-none border-none text-[12px] font-medium w-20 min-w-0"
          autoFocus
        />
      ) : (
        <span className="max-w-[100px] truncate">{displayLabel}</span>
      )}
      {showClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <IconX size={10} />
        </button>
      )}
    </div>
  )
}
