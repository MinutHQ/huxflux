import type { ToolCall } from "@huxflux/shared"
import { markdownToPlainText } from "../utils"

/** One stretch of an assistant turn: an optional full-size text block followed
 *  by the tool calls that ran after it. Text that is not promoted stays inside
 *  the accordion as its tool call's `precedingText`. */
export interface TurnSegment {
  /** Promoted `precedingText` of `calls[0]`, rendered above the accordion. */
  text?: string
  calls: ToolCall[]
}

const SUBSTANTIVE_MIN_CHARS = 400

/** A mid-turn reply worth lifting out of the collapsed accordion: long, or
 *  structured like an answer (table, heading). Short "let me check X" narration
 *  stays folded. */
export function isSubstantiveReply(text: string): boolean {
  if (/^\s*\|.*\|\s*$/m.test(text)) return true
  if (/^\s{0,3}#{1,6}\s/m.test(text)) return true
  return markdownToPlainText(text).length >= SUBSTANTIVE_MIN_CHARS
}

export function promoteAll(): boolean {
  return true
}

/** Split a turn's tool calls into segments. A call whose `precedingText`
 *  passes `promote` starts a new segment with that text lifted out; every
 *  other call joins the current segment. Empty input yields no segments. */
export function buildTurnSegments(calls: ToolCall[], promote: (text: string) => boolean): TurnSegment[] {
  const segments: TurnSegment[] = []
  for (const call of calls) {
    const text = call.precedingText?.trim() ? call.precedingText : undefined
    if (text && promote(text)) {
      segments.push({ text, calls: [call] })
      continue
    }
    const current = segments[segments.length - 1]
    if (current) current.calls.push(call)
    else segments.push({ calls: [call] })
  }
  return segments
}

/** True when the turn's last tool call is the promoted head of its segment,
 *  i.e. its text is already on screen and must not be repeated as the body. */
export function lastCallIsPromoted(segments: TurnSegment[]): boolean {
  const last = segments[segments.length - 1]
  return !!last?.text && last.calls.length === 1
}
