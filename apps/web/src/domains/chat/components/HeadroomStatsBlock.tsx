import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { formatTokens } from "../utils"

interface HeadroomStatsBlockProps {
  agentId: string
}

function formatUsd(n: number): string {
  if (n === 0) return "$0"
  if (n < 0.01) return "<$0.01"
  return `$${n.toFixed(2)}`
}

/**
 * Savings the Headroom proxy attributes to this agent, plus the proxy-wide
 * prompt-cache line (the proxy cannot attribute cache busts per project).
 * Lives inside the context-ring popover, so it inherits that popover's
 * `text-xs` row styling. Polls while mounted; closing the popover unmounts it.
 */
export function HeadroomStatsBlock({ agentId }: HeadroomStatsBlockProps) {
  const { data, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.headroom.agentStats(agentId),
    queryFn: () => api.headroom.agentStats(agentId),
    refetchInterval: 10_000,
  })

  const agent = data?.agent ?? null
  const proxy = data?.proxy ?? null

  return (
    <div className="border-t border-border pt-1.5 space-y-1">
      <div className="text-muted-foreground/60 text-[10px] uppercase tracking-wide">Headroom</div>
      {isLoading && <div className="text-muted-foreground/50">Loading savings...</div>}
      {!isLoading && !agent && <div className="text-muted-foreground/50">No requests through Headroom yet</div>}
      {agent && (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Requests</span>
            <span className="font-medium">{agent.requests}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tokens saved</span>
            <span className="font-medium">{formatTokens(agent.tokensSaved)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Savings</span>
            <span className="font-medium">{agent.savingsPercent.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost saved</span>
            <span className="font-medium">{formatUsd(agent.savingsUsd)}</span>
          </div>
        </>
      )}
      {proxy && proxy.cacheBustCount != null && (
        <div className="text-muted-foreground/50 text-[10px] pt-0.5">
          Proxy-wide: {proxy.cacheBustCount} cache {proxy.cacheBustCount === 1 ? "bust" : "busts"}
          {proxy.tokensLostToCacheBust != null && `, ${formatTokens(proxy.tokensLostToCacheBust)} tokens lost`}
        </div>
      )}
    </div>
  )
}
