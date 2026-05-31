import { useCallback, useEffect, useRef, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconLoader2 } from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import { formatTokens } from "../utils"

interface ContextData {
  used: number
  limit: number
  percent: number
  categories?: Array<{ name: string; tokens: number; percent: number }>
}

interface ContextRingProps {
  agentId: string
  isStreaming?: boolean
}

interface RingProps {
  ctx: ContextData | null
  loading: boolean
}

function Ring({ ctx, loading }: RingProps) {
  const pct = ctx?.percent ?? 0
  const size = 28
  const r = 10
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct >= 90 ? "#f87171" : pct >= 70 ? "#facc15" : "currentColor"
  const opacity = !ctx ? 0.2 : pct < 70 ? 0.4 : 1

  return (
    <div
      className="relative flex items-center justify-center shrink-0 text-muted-foreground cursor-default"
      style={{ opacity }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/20" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
      </svg>
      {loading ? (
        <IconLoader2 size={10} className="absolute text-muted-foreground/50 animate-spin" />
      ) : ctx ? (
        <span className="absolute text-[8px] font-medium" style={{ color: pct >= 70 ? color : undefined }}>
          {pct}
        </span>
      ) : null}
    </div>
  )
}

interface RingPopoverContentProps {
  ctx: ContextData | null
  loading: boolean
  fetchFailed: boolean
  onRefresh: () => void
}

function RingPopoverContent({ ctx, loading, fetchFailed, onRefresh }: RingPopoverContentProps) {
  if (!ctx) {
    if (loading) return <div className="text-center text-muted-foreground/50 py-1">Loading context...</div>
    if (fetchFailed) {
      return (
        <>
          <div className="text-center text-muted-foreground/50 py-1">No active session</div>
          <button
            onClick={onRefresh}
            className="w-full text-center text-muted-foreground/50 hover:text-muted-foreground text-[10px] pt-0.5 transition-colors"
          >
            Retry
          </button>
        </>
      )
    }
    return null
  }
  return (
    <>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Context</span>
        <span className="font-medium">{ctx.percent}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Used</span>
        <span className="font-medium">{formatTokens(ctx.used)} tokens</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Limit</span>
        <span className="font-medium">{formatTokens(ctx.limit)} tokens</span>
      </div>
      {ctx.categories && ctx.categories.length > 0 && (
        <div className="border-t border-border pt-1.5 space-y-1">
          {ctx.categories.filter(c => c.percent >= 0.5).map((c) => (
            <div key={c.name} className="flex justify-between">
              <span className="text-muted-foreground truncate mr-2">{c.name}</span>
              <span className="font-medium shrink-0">{formatTokens(c.tokens)}</span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="w-full text-center text-muted-foreground/50 hover:text-muted-foreground text-[10px] pt-1 transition-colors"
      >
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </>
  )
}

export function ContextRing({ agentId, isStreaming }: ContextRingProps) {
  const [ctx, setCtx] = useState<ContextData | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const prevStreamingRef = useRef(isStreaming)
  const fetchedOnceRef = useRef(false)
  const prevAgentIdRef = useRef(agentId)

  const fetchContext = useCallback(async () => {
    setLoading(true)
    setFetchFailed(false)
    try {
      // fire-and-forget; intentional: manually-triggered context fetch driven by streaming-end and manual refresh, custom failure modes
      // eslint-disable-next-line no-restricted-syntax
      const data = await api.agents.context(agentId)
      if (data.limit > 0) {
        setCtx(data)
      } else {
        setFetchFailed(true)
      }
    } catch {
      setFetchFailed(true)
    } finally {
      setLoading(false)
    }
  }, [agentId])

  // Fetch on mount or agent change
  useEffect(() => {
    if (!fetchedOnceRef.current || prevAgentIdRef.current !== agentId) {
      fetchedOnceRef.current = true
      prevAgentIdRef.current = agentId
      fetchContext()
    }
  }, [agentId, fetchContext])

  // Refetch when streaming stops (message completed)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      const timer = setTimeout(fetchContext, 2000)
      return () => clearTimeout(timer)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, fetchContext])

  return (
    <Popover>
      <PopoverTrigger asChild><Ring ctx={ctx} loading={loading} /></PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-52 text-xs p-2.5 space-y-1.5">
        <RingPopoverContent ctx={ctx} loading={loading} fetchFailed={fetchFailed} onRefresh={fetchContext} />
      </PopoverContent>
    </Popover>
  )
}
