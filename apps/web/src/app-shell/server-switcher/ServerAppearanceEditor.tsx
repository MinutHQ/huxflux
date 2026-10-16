import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { cn } from "@huxflux/ui"
import type { HuxfluxServer } from "@huxflux/shared"
import { SERVER_COLORS, SERVER_ICONS } from "./serverAppearance"
import { serverInitials } from "./describeAttention"
import { IconImagePicker } from "./IconImagePicker"

interface ServerAppearanceEditorProps {
  server: HuxfluxServer
  anchorRect: DOMRect
  onChange: (patch: { icon?: string; color?: string; iconImage?: string }) => void
  onClose: () => void
}

/**
 * Small portal popover for picking a server's switcher icon and tile color,
 * or an uploaded / Codex-generated image. Opens above its anchor; changes apply immediately. Closes on outside click
 * or Escape.
 */
export function ServerAppearanceEditor({ server, anchorRect, onChange, onClose }: ServerAppearanceEditorProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  const tileClass = "w-7 h-7 rounded-md flex items-center justify-center transition-colors"

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-64 bg-card border border-border rounded-xl shadow-xl p-2.5 space-y-2.5"
      style={{ bottom: window.innerHeight - anchorRect.top + 8, left: Math.max(8, anchorRect.left - 8) }}
    >
      <div className="text-[11px] font-medium text-foreground truncate">{server.name}</div>
      <div className="grid grid-cols-6 gap-1">
        <button
          onClick={() => onChange({ icon: undefined, iconImage: undefined })}
          title="Initials"
          className={cn(tileClass, "text-[10px] font-semibold", !server.icon && !server.iconImage ? "bg-accent ring-1 ring-ring" : "hover:bg-accent/60")}
        >
          {serverInitials(server.name)}
        </button>
        {Object.entries(SERVER_ICONS).map(([key, Icon]) => (
          <button
            key={key}
            onClick={() => onChange({ icon: key, iconImage: undefined })}
            title={key}
            className={cn(tileClass, server.icon === key && !server.iconImage ? "bg-accent ring-1 ring-ring" : "hover:bg-accent/60")}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange({ color: undefined })}
          title="Default"
          className={cn("w-5 h-5 rounded-full bg-sidebar-accent border border-border", !server.color && "ring-2 ring-ring ring-offset-1 ring-offset-card")}
        />
        {Object.entries(SERVER_COLORS).map(([key, c]) => (
          <button
            key={key}
            onClick={() => onChange({ color: key })}
            title={key}
            className={cn("w-5 h-5 rounded-full", c.swatch, server.color === key && "ring-2 ring-ring ring-offset-1 ring-offset-card")}
          />
        ))}
      </div>
      <IconImagePicker serverId={server.id} hasImage={!!server.iconImage} onImage={(iconImage) => onChange({ iconImage })} />
    </div>,
    document.body
  )
}
