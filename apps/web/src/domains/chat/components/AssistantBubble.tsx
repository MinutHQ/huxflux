import { Fragment } from "react"
import type { Message } from "@huxflux/shared"
import { getInlineTurnText, getStripYoureRight } from "@/lib/notificationPrefs"
import { stripHuxfluxTags } from "../utils"
import { AssistantFooter } from "./AssistantFooter"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallsAccordion } from "./ToolCallsAccordion"
import { PRCreatedCard } from "./PRCreatedCard"
import { TurnDiffSummary } from "./TurnDiffSummary"
import { MarkdownContent } from "./MarkdownContent"
import { buildTurnSegments, isSubstantiveReply, lastCallIsPromoted, promoteAll, type TurnSegment } from "./turnSegments"

interface AssistantBubbleProps {
  msg: Message
  isStreaming: boolean
  hasPending: boolean
  pendingText: string
}

/**
 * A finished turn that ended on a tool call (unanswered AskUserQuestion, a stop
 * or restart mid-tool, a trailing TodoWrite) has no `content`: the model's last
 * words are the last tool call's `precedingText`, which otherwise sits inside
 * the collapsed accordion and reads as "the agent never answered". Surface it
 * as the message body instead, unless a segment already shows it.
 */
function trailingToolText(msg: Message, isStreaming: boolean, segments: TurnSegment[]): string | undefined {
  if (isStreaming || (msg.content && !isOnlyInterruptNote(msg.content))) return undefined
  if (lastCallIsPromoted(segments)) return undefined
  const last = msg.toolCalls?.[msg.toolCalls.length - 1]
  return last?.precedingText?.trim() ? last.precedingText : undefined
}

// The server appends this note when it had to stop the turn itself (restart).
// A body that is only the note still wants the model's last words above it.
function isOnlyInterruptNote(content: string): boolean {
  return /^\*Turn interrupted: [^\n]*\*$/.test(content.trim())
}

function stripYoureRight(text: string): string {
  return getStripYoureRight()
    ? text.replace(/^(You're (absolutely |completely |totally |entirely )?right[!.,]?\s*)+/i, "")
    : text
}

function TurnText({ content, className }: { content: string; className?: string }) {
  return (
    <div className={`text-sm text-foreground leading-relaxed ${className ?? ""}`}>
      <MarkdownContent content={stripHuxfluxTags(stripYoureRight(content))} />
    </div>
  )
}

export function AssistantBubble({ msg, isStreaming, hasPending, pendingText }: AssistantBubbleProps) {
  // Mid-turn text (a tool call's precedingText) is folded into the accordion
  // unless promoted: everything when the user opted in, else only replies that
  // look like an answer rather than narration. Each promoted block opens a new
  // segment so it renders in order, full size, above the calls that followed.
  const segments = buildTurnSegments(msg.toolCalls ?? [], getInlineTurnText() ? promoteAll : isSubstantiveReply)
  const trailingText = trailingToolText(msg, isStreaming, segments)
  const body = trailingText ? [trailingText.trimEnd(), msg.content].filter(Boolean).join("\n\n") : msg.content
  const lastIdx = segments.length - 1
  return (
    <div className="mb-5 max-w-4xl">
      {msg.thinking && <ThinkingBlock text={msg.thinking} />}

      {segments.map((seg, i) => (
        <Fragment key={seg.calls[0]?.id ?? i}>
          {seg.text && <TurnText content={seg.text} className="mb-3" />}
          {/* Only the last segment is live: it owns the spinner and the text
              streaming since the last tool call. */}
          <ToolCallsAccordion
            calls={seg.calls}
            isStreaming={i === lastIdx && isStreaming}
            pendingText={i === lastIdx ? pendingText : undefined}
            omitFirstPrecedingText={!!seg.text}
            omitLastPrecedingText={i === lastIdx && !!trailingText}
          />
        </Fragment>
      ))}

      {/* Streaming text before the first tool call exists needs a home too. */}
      {segments.length === 0 && isStreaming && hasPending && (
        <ToolCallsAccordion calls={[]} isStreaming pendingText={pendingText} />
      )}

      {msg.content && !isStreaming && <PRCreatedCard content={msg.content} />}

      {body && <TurnText content={body} />}

      {!isStreaming && msg.toolCalls && msg.toolCalls.length > 0 && (
        <TurnDiffSummary calls={msg.toolCalls} />
      )}

      <AssistantFooter msg={msg} body={body} />
    </div>
  )
}
