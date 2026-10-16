import { cn } from "@huxflux/ui"
import type { ServerAttention } from "@huxflux/shared"

interface AttentionBadgeProps {
  attention: ServerAttention | null | undefined
  className?: string
}

/**
 * Corner badge for a server: an amber count when agents are blocked on a
 * question, a small primary dot when there are only unread turns, nothing
 * otherwise. Positioned by the caller via `className`.
 */
export function AttentionBadge({ attention, className }: AttentionBadgeProps) {
  if (!attention) return null
  if (attention.waiting > 0) {
    return (
      <span
        className={cn(
          "min-w-[14px] h-[14px] px-[3px] rounded-full bg-amber-400 text-[9px] font-semibold leading-[14px] text-center text-black ring-2 ring-sidebar",
          className
        )}
      >
        {attention.waiting}
      </span>
    )
  }
  if (attention.unread > 0) {
    return <span className={cn("w-2 h-2 rounded-full bg-primary ring-2 ring-sidebar", className)} />
  }
  return null
}
