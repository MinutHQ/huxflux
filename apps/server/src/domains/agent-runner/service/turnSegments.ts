// Turn segmentation for mid-run message injection.
//
// A turn normally streams into one assistant message. When a user message is
// injected into a running turn, the chat should read
//   assistant work so far → injected message → assistant work after it
// so the current "segment" is closed (content persisted, `message:done`) and a
// fresh skeleton is opened below the injected message (`message:start`).
// Everything the stream produces afterwards routes to the new segment via the
// shared TurnSegmentRef.
//
// Segment-scoped state (pendingText, thinking, tool calls) resets per segment;
// turn-scoped state (fullContent for tag dispatch, token usage) accumulates
// until finalize, which persists only the LAST segment.

import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { messages as messagesTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type { Message } from "../../../types.js"
import type { StreamState } from "../../agents/agents.types.js"
import { stripTagsFromBody } from "./tagParser.js"

/** Mutable identity of the turn's CURRENT assistant message (segment). */
export interface TurnSegmentRef {
  messageId: string
  /** createdAt of the current segment's skeleton row */
  createdAt: string
  /** epoch ms when the current segment started (drives durationMs) */
  startedAt: number
}

const splitters = new Map<string, () => void>()

export function registerTurnSplitter(agentId: string, split: () => void): void {
  splitters.set(agentId, split)
}

export function unregisterTurnSplitter(agentId: string): void {
  splitters.delete(agentId)
}

/** Split the agent's running turn at the current point. No-op when the agent
 *  has no registered splitter (not running, or a non-segmenting provider). */
export function splitCurrentTurn(agentId: string): void {
  splitters.get(agentId)?.()
}

interface MakeSplitterArgs {
  agentId: string
  model: string
  state: StreamState
  turnRef: TurnSegmentRef
}

/** Build the splitter closure registered for one turn. */
export function makeTurnSplitter(args: MakeSplitterArgs): () => void {
  const { agentId, model, state, turnRef } = args
  return function splitSegment(): void {
    closeSegment(agentId, model, state, turnRef)
    openSegment(agentId, state, turnRef)
  }
}

function closeSegment(agentId: string, model: string, state: StreamState, turnRef: TurnSegmentRef): void {
  const content = stripTagsFromBody(state.pendingText)
  const thinking = state.fullThinking || null
  const durationMs = Date.now() - turnRef.startedAt
  db.update(messagesTable)
    .set({ content, thinking, durationMs, model })
    .where(eq(messagesTable.id, turnRef.messageId))
    .run()
  const done: Message = {
    id: turnRef.messageId,
    role: "assistant",
    content,
    thinking: thinking ?? undefined,
    timestamp: turnRef.createdAt,
    durationMs,
    model,
    toolCalls: state.collectedToolCalls.map((tc) => ({
      id: tc.id, tool: tc.tool, args: tc.args, result: tc.result, precedingText: tc.precedingText,
    })),
  }
  agentsWs.messageDone(agentId, turnRef.messageId, done, true)
}

function openSegment(agentId: string, state: StreamState, turnRef: TurnSegmentRef): void {
  // Segment-scoped resets. fullContent is deliberately kept: finalize parses
  // the whole turn's text for huxflux tags. Token counters are turn-level too.
  state.pendingText = ""
  state.fullThinking = ""
  state.collectedToolCalls = []
  state.toolCallOrderIdx = 0

  const newId = uuid()
  const now = new Date().toISOString()
  db.insert(messagesTable).values({
    id: newId, agentId, role: "assistant", content: "",
    timestamp: now, createdAt: now,
  }).run()
  turnRef.messageId = newId
  turnRef.createdAt = now
  turnRef.startedAt = Date.now()
  agentsWs.messageStart(agentId, newId)
}
