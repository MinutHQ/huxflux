import { useMemo } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import type { Agent } from "@huxflux/shared"
import { formatTokens } from "../utils"
import { deriveChatStats, formatDuration, type ChatStats, type ContextUsage } from "./contextStats"

interface ContextRingProps {
  agent: Agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  models: any[]
}

const RING_SIZE = 28
const RING_RADIUS = 10

function ringColor(pct: number | null): string {
  if (pct == null) return "currentColor"
  if (pct >= 90) return "#f87171"
  if (pct >= 70) return "#facc15"
  return "currentColor"
}

function Ring({ context }: { context: ContextUsage }) {
  const pct = context.hasData ? context.percent : null
  const circ = 2 * Math.PI * RING_RADIUS
  const dash = ((pct ?? 0) / 100) * circ
  const color = ringColor(pct)
  const opacity = pct == null ? 0.3 : pct < 70 ? 0.5 : 1

  return (
    <span className="relative flex items-center justify-center" style={{ opacity }}>
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="rotate-[-90deg]">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/20" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
      </svg>
      <span className="absolute text-[8px] font-medium tabular-nums" style={{ color: pct != null && pct >= 70 ? color : undefined }}>
        {pct == null ? "?" : pct}
      </span>
    </span>
  )
}

function StatRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={muted ? "text-muted-foreground shrink-0 tabular-nums" : "font-medium shrink-0 tabular-nums"}>{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 pt-1.5 pb-0.5">{children}</div>
}

function ContextSection({ context }: { context: ContextUsage }) {
  if (!context.hasData) {
    return <div className="text-muted-foreground/60 py-1">No completed turn yet</div>
  }
  return (
    <>
      <div className="flex justify-between items-baseline">
        <span className="text-muted-foreground">Context window</span>
        <span className="font-semibold text-sm tabular-nums">{context.percent == null ? "—" : `${context.percent}%`}</span>
      </div>
      <div className="h-1 rounded-full bg-muted-foreground/15 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${context.percent ?? 0}%`, background: ringColor(context.percent) === "currentColor" ? "var(--foreground)" : ringColor(context.percent) }} />
      </div>
      <StatRow label="Used" value={`${formatTokens(context.used)} tokens`} />
      <StatRow label="Limit" value={context.limit == null ? "unknown" : `${formatTokens(context.limit)} tokens`} />
    </>
  )
}

function StatsBody({ stats }: { stats: ChatStats }) {
  const { lastTurn, conversation } = stats
  return (
    <>
      <ContextSection context={stats.context} />
      {lastTurn && (
        <>
          <SectionTitle>Last turn</SectionTitle>
          <StatRow label="Input" value={formatTokens(lastTurn.inputTokens)} />
          <StatRow label="Output" value={formatTokens(lastTurn.outputTokens)} />
          <StatRow label="Cache read" value={formatTokens(lastTurn.cacheReadTokens)} />
          <StatRow label="Cache write" value={formatTokens(lastTurn.cacheWriteTokens)} />
          <StatRow label="Duration" value={formatDuration(lastTurn.durationMs)} />
        </>
      )}
      <SectionTitle>Conversation</SectionTitle>
      <StatRow label="Messages" value={`${conversation.userMessages} sent · ${conversation.assistantTurns} turns`} />
      <StatRow label="Tool calls" value={String(conversation.toolCalls)} />
      <StatRow label="Input" value={formatTokens(conversation.inputTokens)} />
      <StatRow label="Output" value={formatTokens(conversation.outputTokens)} />
      <StatRow label="Cache read" value={formatTokens(conversation.cacheReadTokens)} />
      <StatRow label="Cache write" value={formatTokens(conversation.cacheWriteTokens)} />
      <StatRow
        label="Cache hit rate"
        value={conversation.cacheHitRate == null ? "—" : `${Math.round(conversation.cacheHitRate * 100)}%`}
        muted={conversation.cacheHitRate == null}
      />
      <StatRow label="Model time" value={formatDuration(conversation.durationMs)} />
    </>
  )
}

/**
 * Context-window ring next to the composer. Everything it shows is derived
 * from the messages already loaded for the agent (the runner stores per-turn
 * usage from the CLI's stream-json output), so opening it costs nothing and
 * never touches the agent's session.
 */
export function ContextRing({ agent, models }: ContextRingProps) {
  const stats = useMemo(
    () => deriveChatStats(agent.messages, agent.model, agent.provider ?? "claude", models),
    [agent.messages, agent.model, agent.provider, models],
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center shrink-0 h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Context usage and chat stats"
          aria-label="Context usage and chat stats"
        >
          <Ring context={stats.context} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-60 text-xs p-3 space-y-1.5">
        <StatsBody stats={stats} />
      </PopoverContent>
    </Popover>
  )
}
