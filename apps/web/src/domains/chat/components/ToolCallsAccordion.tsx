import { useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconBolt,
  IconChevronRight,
  IconLoader2,
} from "@tabler/icons-react"
import type { ToolCall } from "@huxflux/shared"
import { formatToolCall, stripHuxfluxTags } from "../utils"
import { MarkdownContent } from "./MarkdownContent"
import { ToolCallRow } from "./ToolCallRow"

interface ToolCallsAccordionProps {
  calls: ToolCall[]
  hasContent?: boolean
  isStreaming?: boolean
  pendingText?: string
}

function computeSummary(calls: ToolCall[], isStreaming: boolean | undefined): string {
  const lastCall = calls[calls.length - 1]
  // When collapsed and streaming, show the last tool call; otherwise show distinct tool names
  if (isStreaming && lastCall) {
    const { title, detail } = formatToolCall(lastCall.tool, lastCall.args)
    return detail ? `${title} ${detail}` : title
  }
  const distinct = [...new Set(calls.map((c) => c.tool))]
  return distinct.slice(0, 4).join(", ") + (distinct.length > 4 ? ", …" : "")
}

export function ToolCallsAccordion({ calls, isStreaming, pendingText }: ToolCallsAccordionProps) {
  // Folded by default, streaming or not. The collapsed header already shows
  // the live last tool call while streaming, and a mid-run injection opens a
  // fresh segment (new accordion) so auto-opening would re-expand on every
  // injected message. The user's toggle is the only thing that opens it.
  const [open, setOpen] = useState(false)

  const label = calls.length === 1 ? "1 tool call" : `${calls.length} tool calls`
  const summary = computeSummary(calls, isStreaming)

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
        {!open && (
          <span className="text-muted-foreground/40 ml-1 truncate">{summary}</span>
        )}
      </button>
      {open && (
        <div className="mt-0.5 ml-3 border-l border-border/50 pl-3 space-y-0.5">
          {calls.map((tc) => (
            <div key={tc.id}>
              {tc.precedingText && tc.precedingText.trim() && (
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
