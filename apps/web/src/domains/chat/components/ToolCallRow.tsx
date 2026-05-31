import { useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconChevronRight,
  IconLoader2,
  IconSparkles,
} from "@tabler/icons-react"
import type { ToolCall } from "@huxflux/shared"
import { toolIcon, formatToolCall, stripHuxfluxTags } from "../utils"
import { MarkdownContent } from "./MarkdownContent"
import { AgentPromptBlock } from "./AgentPromptBlock"
import { ResultBlock } from "./ResultBlock"

function AgentToolCallRow({ call, indent, isStreaming }: { call: ToolCall; indent: boolean; isStreaming: boolean }) {
  const [open, setOpen] = useState(true)
  let description = ""
  let prompt = ""
  if (call.args) {
    try {
      const parsed = JSON.parse(call.args)
      description = parsed.description ?? ""
      prompt = parsed.prompt ?? ""
    } catch { /* raw string fallback */ }
  }
  // A tool call is only "running" while the parent message is still
  // streaming AND no result has come back yet. Without the streaming guard,
  // any tool call that never received a result (e.g. legacy rows) would
  // spin forever after the message finished.
  const isRunning = isStreaming && !call.result
  const hasOutputText = !!(call.outputText && call.outputText.trim())
  const hasSubCalls = !!(call.subCalls && call.subCalls.length > 0)
  return (
    <div className={cn("mt-1", indent && "ml-4")}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0", open && "rotate-90")} />
        {isRunning
          ? <IconLoader2 size={12} className="text-muted-foreground/70 shrink-0 animate-spin" />
          : <IconSparkles size={12} className="text-muted-foreground/60 shrink-0" />}
        <span className="font-medium text-foreground/80">Agent</span>
        {description && <span className="text-muted-foreground/60 ml-1 truncate">{description}</span>}
      </button>
      {open && (
        <div className="ml-3 mt-0.5 border-l border-border/50 pl-3 space-y-1.5">
          {prompt && <AgentPromptBlock prompt={prompt} />}
          {hasSubCalls && (
            <div className="space-y-0.5">
              {call.subCalls!.map((sub) => (
                <ToolCallRow key={sub.id} call={sub} />
              ))}
            </div>
          )}
          {/* Human-readable text streamed by this sub-agent — kept tied to its row */}
          {hasOutputText && (
            <div className="mt-1 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
              <MarkdownContent content={stripHuxfluxTags(call.outputText!)} />
            </div>
          )}
          {isRunning && !hasOutputText && !hasSubCalls && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <IconLoader2 size={11} className="animate-spin" />
              <span>Working…</span>
            </div>
          )}
          {/* Final result summary, once the sub-agent has finished */}
          {call.result && <ResultBlock result={call.result} />}
        </div>
      )}
    </div>
  )
}

export function ToolCallRow({ call, indent = false, isStreaming = false }: { call: ToolCall; indent?: boolean; isStreaming?: boolean }) {
  if (call.tool === "Agent") {
    return <AgentToolCallRow call={call} indent={indent} isStreaming={isStreaming} />
  }

  const { title, detail } = formatToolCall(call.tool, call.args)
  return (
    <div className={cn("mt-0.5", indent && "ml-4")}>
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground py-0.5 min-w-0">
        {toolIcon(call.tool)}
        <span className="font-medium text-foreground/70 shrink-0">{title}</span>
        {detail && (
          <span className="font-mono text-[11px] text-muted-foreground/60 truncate min-w-0">
            {detail}
          </span>
        )}
      </div>
      {call.result && <ResultBlock result={call.result} />}
    </div>
  )
}
