import { useState } from "react"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import {
  IconChevronDown,
  IconClipboard,
  IconFolder,
} from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import { OPEN_IN_APPS, SSH_CAPABLE_EDITORS } from "../config"

interface OpenInPopoverProps {
  agentId: string
  location: string
  lastOpenInApp: string
  remoteMode: boolean
  detectedEditors: string[]
  sshConfigured: boolean | null
  onSelect: (appKey: string) => void
  onOpenSshSetup: () => void
}

function SshNotConfiguredBanner({ onOpenSshSetup }: { onOpenSshSetup: () => void }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 mb-1 text-[11px] text-amber-400 bg-amber-400/10 rounded">
      <span>SSH not configured</span>
      <button onClick={onOpenSshSetup} className="underline ml-1">Setup</button>
    </div>
  )
}

interface AppItem {
  key: string
  label: string
  Icon: typeof IconFolder
  shortcut: string
}

function AppButton({ item, remoteMode, onSelect }: { item: AppItem; remoteMode: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
    >
      <item.Icon size={14} className="text-muted-foreground" />
      <span className="flex-1 text-left">{item.label}</span>
      {!remoteMode && <span className="text-[10px] text-muted-foreground/40">{item.shortcut}</span>}
    </button>
  )
}

export function OpenInPopover({
  agentId,
  location,
  lastOpenInApp,
  remoteMode,
  detectedEditors,
  sshConfigured,
  onSelect,
  onOpenSshSetup,
}: OpenInPopoverProps) {
  const [open, setOpen] = useState(false)
  const lastApp = OPEN_IN_APPS.find((a) => a.key === lastOpenInApp) ?? OPEN_IN_APPS[0]
  const LastIcon = lastApp.Icon

  const apps = remoteMode
    ? OPEN_IN_APPS.filter((a) => SSH_CAPABLE_EDITORS.includes(a.key) && detectedEditors.includes(a.key))
    : OPEN_IN_APPS

  async function handleCopyPath() {
    setOpen(false)
    // fire-and-forget; intentional: one-off path read for clipboard, not a render-time query
    // eslint-disable-next-line no-restricted-syntax
    const res = await api.agents.worktreePath(agentId)
    await navigator.clipboard.writeText(res.path)
    toast.success("Path copied")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border hover:bg-accent transition-colors">
          <LastIcon size={12} className="text-muted-foreground/60" />
          <span className="text-[11px] text-muted-foreground font-mono">/{location}</span>
          <IconChevronDown size={10} className="text-muted-foreground/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1" sideOffset={4}>
        {remoteMode && sshConfigured === false && (
          <SshNotConfiguredBanner onOpenSshSetup={() => { setOpen(false); onOpenSshSetup() }} />
        )}
        {apps.map((item) => (
          <AppButton key={item.key} item={item} remoteMode={remoteMode} onSelect={() => { onSelect(item.key); setOpen(false) }} />
        ))}
        {remoteMode && detectedEditors.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
            No SSH-capable editors found.<br />Install VS Code or Cursor.
          </div>
        )}
        <div className="border-t border-border my-1" />
        <button
          onClick={handleCopyPath}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
        >
          <IconClipboard size={14} className="text-muted-foreground" />
          <span className="flex-1 text-left">Copy path</span>
          {!remoteMode && <span className="text-[10px] text-muted-foreground/40">⌘⇧C</span>}
        </button>
      </PopoverContent>
    </Popover>
  )
}
