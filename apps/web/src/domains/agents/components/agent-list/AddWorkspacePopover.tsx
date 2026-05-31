import React from "react"
import { AnchoredPopover } from "@huxflux/ui"
import { IconFolder, IconFolderPlus, IconWorld, IconBolt } from "@tabler/icons-react"

interface AddWorkspacePopoverProps {
  onClose: () => void
  onOpenProject: () => void
  onAddFolder: () => void
  onClone: () => void
  onQuickStart: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * Floating menu opened by the folder-plus button in the agents header. Four
 * mutually-exclusive actions: open an existing local git project, register a
 * non-git folder, clone a remote repo by URL, or invoke the quick-start
 * template. Each closes the popover and defers to the parent (which owns the
 * actual dialog state).
 */
export function AddWorkspacePopover({
  onClose,
  onOpenProject,
  onAddFolder,
  onClone,
  onQuickStart,
  anchorRef,
}: AddWorkspacePopoverProps) {
  const items = [
    { icon: IconFolder, label: "Open project", onClick: onOpenProject },
    { icon: IconFolderPlus, label: "Add folder", onClick: onAddFolder },
    { icon: IconWorld, label: "Clone from URL", onClick: onClone },
    { icon: IconBolt, label: "Quick start", onClick: onQuickStart },
  ]

  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      onClose={onClose}
      placement="bottom-end"
      offset={6}
      className="w-48 overflow-hidden py-1"
    >
      {items.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          onClick={() => { onClose(); onClick() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-foreground hover:bg-accent/60 transition-colors text-left"
        >
          <Icon size={13} className="text-muted-foreground/60 shrink-0" />
          {label}
        </button>
      ))}
    </AnchoredPopover>
  )
}
