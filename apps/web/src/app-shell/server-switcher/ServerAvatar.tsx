import { createElement, useState } from "react"
import { useIsMutating } from "@tanstack/react-query"
import { IconLoader2 } from "@tabler/icons-react"
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@huxflux/ui"
import type { HuxfluxServer, ServerAttention, ServerStatus } from "@huxflux/shared"
import { AttentionBadge } from "./AttentionBadge"
import { describeAttention, serverInitials } from "./describeAttention"
import { getServerIcon, getServerTileClass, serverIconMutationKey } from "./serverAppearance"
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
  size?: "md" | "lg"
}

/**
 * One-click switch target: a rounded tile showing the server's chosen icon
 * (or initials) on its chosen color, an active ring, an attention badge in
 * the top corner and a connection dot in the bottom corner. Right-click
 * opens the icon/color editor. A spinner covers the tile while Codex draws
 * a new icon for it.
 */
export function ServerAvatar({ server, status, attention, isActive, onSelect, onChangeAppearance, tooltipSide = "right", size = "md" }: ServerAvatarProps) {
  const [editorAnchor, setEditorAnchor] = useState<DOMRect | null>(null)
  const unreachable = status === "offline" || status === "unauthorized"
  const summary = describeAttention(attention)
  const icon = getServerIcon(server.icon)
  const tileClass = getServerTileClass(server.color)
  const isDrawing = useIsMutating({ mutationKey: serverIconMutationKey(server.id) }) > 0

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
                size === "lg" ? "w-10 h-10 text-[13px] rounded-xl" : "w-8 h-8 text-[11px]",
                tileClass ?? "bg-sidebar-accent text-sidebar-foreground/80",
                isActive ? "ring-2 ring-primary/70 cursor-default" : "hover:brightness-125 hover:rounded-md",
                unreachable && "opacity-50"
              )}
            >
              {server.iconImage
                ? <img src={server.iconImage} alt="" className="w-full h-full object-cover rounded-[inherit]" />
                : icon ? createElement(icon, { size: size === "lg" ? 20 : 16 }) : serverInitials(server.name)}
              {isDrawing && (
                <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/60 text-foreground">
                  <IconLoader2 size={size === "lg" ? 20 : 16} className="animate-spin" />
                </span>
              )}
              <AttentionBadge attention={attention} className="absolute -top-1 -right-1" />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-sidebar",
                  size === "lg" ? "w-3 h-3" : "w-2.5 h-2.5",
                  STATUS_DOT_CLASS[status]
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide} sideOffset={6} className="flex-col items-start gap-0.5">
            <span className="font-medium">{server.name}{isActive ? " (current)" : ""}</span>
            <span className="opacity-70">{STATUS_LABEL[status]}</span>
            {isDrawing && <span className="opacity-70">Drawing a new icon…</span>}
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
