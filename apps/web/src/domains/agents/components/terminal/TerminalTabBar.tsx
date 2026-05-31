import { useState } from "react"
import { IconPlus } from "@tabler/icons-react"
import type { TerminalTab as TerminalTabModel } from "../../agents.types"
import { TerminalTab } from "./TerminalTab"

interface TerminalTabBarProps {
  tabs: TerminalTabModel[]
  activeTerminalId: string
  isTerminalTabActive: boolean
  onSelect: (terminalId: string) => void
  onAdd: () => void
  onClose: (terminalId: string) => void
  onRename: (terminalId: string, label: string | null) => void
}

/** Top strip of terminal tabs with rename-on-double-click and an add button. */
export function TerminalTabBar({
  tabs,
  activeTerminalId,
  isTerminalTabActive,
  onSelect,
  onAdd,
  onClose,
  onRename,
}: TerminalTabBarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  function startRename(tab: TerminalTabModel, displayLabel: string) {
    setRenamingId(tab.terminalId)
    setRenameValue(tab.label ?? displayLabel)
  }

  function commitRename() {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    onRename(renamingId, trimmed || null)
    setRenamingId(null)
  }

  return (
    <div className="relative flex items-center px-2 pb-1.5 pt-1 shrink-0 gap-1">
      <div className="absolute inset-0 bg-gradient-to-b from-primary-foreground/[0.04] to-transparent pointer-events-none" />
      <div className="flex items-center flex-1 min-w-0 gap-1 relative">
        {tabs.map((tab, idx) => {
          const displayLabel = tab.label ?? `Terminal ${idx + 1}`
          return (
            <TerminalTab
              key={tab.terminalId}
              tab={tab}
              displayLabel={displayLabel}
              isActive={isTerminalTabActive && activeTerminalId === tab.terminalId}
              isRenaming={renamingId === tab.terminalId}
              renameValue={renameValue}
              showClose={tabs.length > 1}
              onSelect={() => onSelect(tab.terminalId)}
              onStartRename={() => startRename(tab, displayLabel)}
              onRenameChange={setRenameValue}
              onRenameCommit={commitRename}
              onRenameCancel={() => setRenamingId(null)}
              onClose={() => onClose(tab.terminalId)}
            />
          )
        })}

        <button
          onClick={onAdd}
          className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
          title="New terminal"
        >
          <IconPlus size={13} />
        </button>
      </div>
    </div>
  )
}
