import type { ServerAttention } from "@huxflux/shared"

interface RowAttentionProps {
  attention: ServerAttention | null | undefined
  onOpenAgent: (agentId: string) => void
}

/**
 * The agents a server is waiting on, listed under its dropdown row. Each one
 * switches straight to that agent instead of the server's last route.
 */
export function RowAttention({ attention, onOpenAgent }: RowAttentionProps) {
  if (!attention || attention.items.length === 0) return null
  return (
    <div className="pl-[30px] pr-2.5 pb-1.5 space-y-px">
      {attention.items.map((item) => (
        <button
          key={item.agentId}
          onClick={() => onOpenAgent(item.agentId)}
          className="w-full flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
        >
          <span className={item.reason === "waiting" ? "w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" : "w-1.5 h-1.5 rounded-full bg-primary shrink-0"} />
          <span className="truncate flex-1">{item.title}</span>
          <span className="shrink-0 text-muted-foreground/60">{item.reason === "waiting" ? "needs answer" : "unread"}</span>
        </button>
      ))}
    </div>
  )
}
