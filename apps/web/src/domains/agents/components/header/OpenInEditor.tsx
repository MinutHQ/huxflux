import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconChevronDown, IconClipboard, IconCode } from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import { toast } from "sonner"
import { OPEN_IN_APPS, SSH_CAPABLE_EDITORS } from "../../config"
import type { OpenInApp, SshInfo } from "../../agents.types"

interface OpenInEditorProps {
  agentId: string
  lastApp: string
  remoteMode: boolean
  detectedEditors: string[]
  sshInfo: SshInfo | null
  onOpen: (appKey: string) => void
}

function visibleApps(remoteMode: boolean, detectedEditors: string[]): OpenInApp[] {
  if (!remoteMode) return [...OPEN_IN_APPS]
  return OPEN_IN_APPS.filter((a) => SSH_CAPABLE_EDITORS.includes(a.key) && detectedEditors.includes(a.key))
}

/** Split-button: main click opens last-used editor; chevron reveals app picker + copy-path. */
export function OpenInEditor({ agentId, lastApp, remoteMode, detectedEditors, sshInfo, onOpen }: OpenInEditorProps) {
  const [open, setOpen] = useState(false)

  const LastIcon = OPEN_IN_APPS.find((a) => a.key === lastApp)?.Icon ?? IconCode
  const lastLabel = OPEN_IN_APPS.find((a) => a.key === lastApp)?.label ?? "editor"
  const apps = visibleApps(remoteMode, detectedEditors)

  async function copyPath() {
    setOpen(false)
    // fire-and-forget; intentional: one-off path read for clipboard, not a render-time query
    // eslint-disable-next-line no-restricted-syntax
    const res = await api.agents.worktreePath(agentId)
    await navigator.clipboard.writeText(res.path)
    toast.success("Path copied")
  }

  return (
    <div className="flex items-center rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => onOpen(lastApp)}
        className="flex items-center px-1.5 py-1 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        title={`Open in ${lastLabel} (⌘O)`}
      >
        <LastIcon size={13} />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center px-1 py-1 border-l border-border hover:bg-accent transition-colors text-muted-foreground/50 hover:text-muted-foreground">
            <IconChevronDown size={9} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1" sideOffset={4}>
          {remoteMode && sshInfo && !sshInfo.configured && (
            <div className="flex items-center justify-between px-2 py-1.5 mb-1 text-[11px] text-amber-400 bg-amber-400/10 rounded">
              <span>SSH not configured</span>
            </div>
          )}
          {apps.map((item) => (
            <button
              key={item.key}
              onClick={() => { onOpen(item.key); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
            >
              <item.Icon size={14} className="text-muted-foreground" />
              <span className="flex-1 text-left">{item.label}</span>
              {!remoteMode && <span className="text-[10px] text-muted-foreground/40">{item.shortcut}</span>}
            </button>
          ))}
          {remoteMode && detectedEditors.length === 0 && (
            <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
              No SSH-capable editors found.<br />Install VS Code or Cursor.
            </div>
          )}
          <div className="border-t border-border my-1" />
          <button
            onClick={() => void copyPath()}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
          >
            <IconClipboard size={14} className="text-muted-foreground" />
            <span className="flex-1 text-left">Copy path</span>
            {!remoteMode && <span className="text-[10px] text-muted-foreground/40">⌘⇧C</span>}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
