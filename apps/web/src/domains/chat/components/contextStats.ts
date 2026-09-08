import type { Message } from "@huxflux/shared"

export interface ContextUsage {
  used: number
  limit: number | null
  percent: number | null
  /** False until an assistant message with usage data exists. */
  hasData: boolean
}

export interface TurnStats {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs: number | null
}

export interface ConversationStats {
  userMessages: number
  assistantTurns: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** Share of prompt tokens served from cache, 0..1. Null when nothing was counted. */
  cacheHitRate: number | null
  durationMs: number
}

export interface ChatStats {
  context: ContextUsage
  lastTurn: TurnStats | null
  conversation: ConversationStats
}

interface ModelLike {
  id: string
  provider?: string
  contextWindow?: number
}

/**
 * Derive the context ring figures and popover stats from the messages the
 * chat already holds. Context size comes from the newest assistant message
 * that carries `contextTokens` (the prompt size of its last model call); the
 * limit prefers the CLI-reported window on that message and falls back to the
 * model catalog entry.
 */
export function deriveChatStats(messages: Message[], model: string, provider: string, models: ModelLike[]): ChatStats {
  const lastWithContext = findLast(messages, (m) => m.role === "assistant" && m.contextTokens != null)
  const catalogWindow = models.find((m) => m.id === model && (m.provider ?? "claude") === provider)?.contextWindow ?? null
  const limit = lastWithContext?.contextWindow ?? catalogWindow
  const used = lastWithContext?.contextTokens ?? 0
  const percent = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null

  const lastAssistant = findLast(messages, (m) => m.role === "assistant" && m.inputTokens != null)
  const lastTurn: TurnStats | null = lastAssistant
    ? {
        inputTokens: lastAssistant.inputTokens ?? 0,
        outputTokens: lastAssistant.outputTokens ?? 0,
        cacheReadTokens: lastAssistant.cacheReadTokens ?? 0,
        cacheWriteTokens: lastAssistant.cacheWriteTokens ?? 0,
        durationMs: lastAssistant.durationMs ?? null,
      }
    : null

  return {
    context: { used, limit, percent, hasData: lastWithContext != null },
    lastTurn,
    conversation: sumConversation(messages),
  }
}

function sumConversation(messages: Message[]): ConversationStats {
  const totals: ConversationStats = {
    userMessages: 0,
    assistantTurns: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheHitRate: null,
    durationMs: 0,
  }
  for (const m of messages) {
    if (m.role === "user") {
      totals.userMessages++
      continue
    }
    totals.assistantTurns++
    totals.toolCalls += m.toolCalls?.length ?? 0
    totals.inputTokens += m.inputTokens ?? 0
    totals.outputTokens += m.outputTokens ?? 0
    totals.cacheReadTokens += m.cacheReadTokens ?? 0
    totals.cacheWriteTokens += m.cacheWriteTokens ?? 0
    totals.durationMs += m.durationMs ?? 0
  }
  const promptTotal = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
  totals.cacheHitRate = promptTotal > 0 ? totals.cacheReadTokens / promptTotal : null
  return totals
}

function findLast<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item !== undefined && predicate(item)) return item
  }
  return undefined
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
