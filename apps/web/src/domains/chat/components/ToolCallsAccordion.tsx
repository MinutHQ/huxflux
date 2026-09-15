import { useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconBolt,
  IconChevronRight,
  IconLoader2,
} from "@tabler/icons-react"
import type { ToolCall } from "@huxflux/shared"
import { formatToolCall, isToolCallRunning, markdownToPlainText, stripHuxfluxTags } from "../utils"
import { MarkdownContent } from "./MarkdownContent"
import { ToolCallRow } from "./ToolCallRow"

interface ToolCallsAccordionProps {
  calls: ToolCall[]
  hasContent?: boolean
  isStreaming?: boolean
  pendingText?: string
  /** The last call's precedingText is rendered as the message body by the
   *  parent (turn ended on a tool call); don't repeat it here. */
  omitLastPrecedingText?: boolean
}

/** Collapsed-header summary. Streaming: the last call, with the model's own
 *  description (when it gave one) ahead of the muted command; it shimmers only
 *  while that call is still running. Finished turn: the distinct tool names. */
function Summary({ calls, isStreaming }: { calls: ToolCall[]; isStreaming: boolean | undefined }) {
  const lastCall = calls[calls.length - 1]
  if (isStreaming && lastCall) {
    const { title, detail, hasDescription } = formatToolCall(lastCall.tool, lastCall.args)
    const running = isToolCallRunning(lastCall, isStreaming)
    return (
      <span className="ml-1 flex items-baseline gap-1.5 min-w-0">
        <span className={cn("shrink-0", !hasDescription ? "text-muted-foreground/40" : running ? "text-shimmer" : "text-foreground/70")}>{title}</span>
        {detail && <span className="text-muted-foreground/40 font-mono text-[11px] truncate min-w-0">{detail}</span>}
      </span>
    )
  }
  const distinct = [...new Set(calls.map((c) => c.tool))]
  return <span className="text-muted-foreground/40 ml-1 truncate">{distinct.slice(0, 4).join(", ") + (distinct.length > 4 ? ", …" : "")}</span>
}

/** The agent's latest mid-turn words: live text since the last tool call,
 *  else, while that call is still running, the text that preceded it. Empty
 *  between a finished call and the next token, and once the turn is done. */
function latestThought(calls: ToolCall[], isStreaming: boolean | undefined, pendingText: string | undefined): string {
  if (!isStreaming) return ""
  if (pendingText?.trim()) return markdownToPlainText(pendingText)
  const lastCall = calls[calls.length - 1]
  if (!lastCall || !isToolCallRunning(lastCall, isStreaming)) return ""
  return markdownToPlainText(lastCall.precedingText ?? "")
}

export function ToolCallsAccordion({ calls, isStreaming, pendingText, omitLastPrecedingText }: ToolCallsAccordionProps) {
  // Folded by default, streaming or not. The collapsed header already shows
  // the live last tool call while streaming, and a mid-run injection opens a
  // fresh segment (new accordion) so auto-opening would re-expand on every
  // injected message. The user's toggle is the only thing that opens it.
  const [open, setOpen] = useState(false)

  const label = calls.length === 1 ? "1 tool call" : `${calls.length} tool calls`
  const thought = open ? "" : latestThought(calls, isStreaming, pendingText)

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5 group"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0", open && "rotate-90")} />
        {isStreaming
          ? <IconLoader2 size={12} className="text-muted-foreground/70 shrink-0 animate-spin" />
          : <IconBolt size={12} className="text-muted-foreground/50 shrink-0" />}
        <span className="font-medium text-foreground/70">{label}</span>
        {!open && <Summary calls={calls} isStreaming={isStreaming} />}
      </button>
      {thought && (
        <div className="ml-[18px] mt-1 text-[12px] leading-relaxed line-clamp-5 text-shimmer">
          {thought}
        </div>
      )}
      {open && (
        <div className="mt-0.5 ml-3 border-l border-border/50 pl-3 space-y-0.5">
          {calls.map((tc, i) => (
            <div key={tc.id}>
              {tc.precedingText && tc.precedingText.trim() && !(omitLastPrecedingText && i === calls.length - 1) && (
                <div className="my-1.5 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
                  <MarkdownContent content={stripHuxfluxTags(tc.precedingText)} />
                </div>
              )}
              <ToolCallRow call={tc} isStreaming={isStreaming} />
            </div>
          ))}
          {/* Live text being streamed since the last tool call. Stays inside
              the accordion so it doesn't flicker through msg.content. */}
          {pendingText && pendingText.trim() && (
            <div className="my-1.5 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
              <MarkdownContent content={stripHuxfluxTags(pendingText)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
