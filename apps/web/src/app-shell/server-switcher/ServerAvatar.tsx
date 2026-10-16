import { createElement, useState } from "react"
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@huxflux/ui"
import type { HuxfluxServer, ServerAttention, ServerStatus } from "@huxflux/shared"
import { AttentionBadge } from "./AttentionBadge"
import { describeAttention, serverInitials } from "./describeAttention"
import { getServerIcon, getServerTileClass } from "./serverAppearance"
import { ServerAppearanceEditor } from "./ServerAppearanceEditor"
import { STATUS_DOT_CLASS, STATUS_LABEL } from "./statusColor"

interface ServerAvatarProps {
  server: HuxfluxServer
  status: ServerStatus
  attention: ServerAttention | null | undefined
  isActive: boolean
  onSelect: () => void
  onChangeAppearance: (patch: { icon?: string; color?: string; iconImage?: string }) => void
  tooltipSide?: "top" | "right"
  size?: "sm" | "md"
}

/**
 * One-click switch target: a rounded tile showing the server's chosen icon
 * (or initials) on its chosen color, an active ring, an attention badge in
 * the top corner and a connection dot in the bottom corner. Right-click
 * opens the icon/color editor.
 */
export function ServerAvatar({ server, status, attention, isActive, onSelect, onChangeAppearance, tooltipSide = "right", size = "md" }: ServerAvatarProps) {
  const [editorAnchor, setEditorAnchor] = useState<DOMRect | null>(null)
  const unreachable = status === "offline" || status === "unauthorized"
  const summary = describeAttention(attention)
  const icon = getServerIcon(server.icon)
  const tileClass = getServerTileClass(server.color)

  function handleContextMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    setEditorAnchor(e.currentTarget.getBoundingClientRect())
  }

  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={isActive ? undefined : onSelect}
              onContextMenu={handleContextMenu}
              aria-current={isActive ? "true" : undefined}
              aria-label={`Switch to ${server.name}`}
              className={cn(
                "relative shrink-0 rounded-lg font-semibold flex items-center justify-center transition-all",
                size === "md" ? "w-8 h-8 text-[11px]" : "w-6 h-6 text-[9px] rounded-md",
                tileClass ?? "bg-sidebar-accent text-sidebar-foreground/80",
                isActive ? "ring-2 ring-primary/70 cursor-default" : "hover:brightness-125 hover:rounded-md",
                unreachable && "opacity-50"
              )}
            >
              {server.iconImage
                ? <img src={server.iconImage} alt="" className="w-full h-full object-cover rounded-[inherit]" />
                : icon ? createElement(icon, { size: size === "md" ? 16 : 12 }) : serverInitials(server.name)}
              <AttentionBadge attention={attention} className="absolute -top-1 -right-1" />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-sidebar",
                  size === "md" ? "w-2.5 h-2.5" : "w-2 h-2",
                  STATUS_DOT_CLASS[status]
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide} sideOffset={6} className="flex-col items-start gap-0.5">
            <span className="font-medium">{server.name}{isActive ? " (current)" : ""}</span>
            <span className="opacity-70">{STATUS_LABEL[status]}</span>
            {summary && <span className="opacity-70">{summary}</span>}
            {attention?.items.map((item) => (
              <span key={item.agentId} className="opacity-70 truncate max-w-56">
                {item.reason === "waiting" ? "● " : "○ "}{item.title}
              </span>
            ))}
            <span className="opacity-50 pt-0.5">Right-click to change icon</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {editorAnchor && (
        <ServerAppearanceEditor
          server={server}
          anchorRect={editorAnchor}
          onChange={onChangeAppearance}
          onClose={() => setEditorAnchor(null)}
        />
      )}
    </>
  )
}
