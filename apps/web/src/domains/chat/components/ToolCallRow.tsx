import { useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconChevronRight,
  IconLoader2,
  IconSparkles,
} from "@tabler/icons-react"
import { isAgentTool, isToolCallRunning, subagentResultText, type ToolCall } from "@huxflux/shared"
import { toolIcon, formatToolCall, stripHuxfluxTags } from "../utils"
import { MarkdownContent } from "./MarkdownContent"
import { AgentPromptBlock } from "./AgentPromptBlock"
import { ResultBlock } from "./ResultBlock"
import { AskUserQuestionResult } from "./AskUserQuestionResult"

function AgentToolCallRow({ call, indent, isStreaming }: { call: ToolCall; indent: boolean; isStreaming: boolean }) {
  const [open, setOpen] = useState(false)
  let description = ""
  let prompt = ""
  if (call.args) {
    try {
      const parsed = JSON.parse(call.args)
      description = parsed.description ?? ""
      prompt = parsed.prompt ?? ""
    } catch { /* raw string fallback */ }
  }
  const isRunning = isToolCallRunning(call, isStreaming)
  const hasOutputText = !!(call.outputText && call.outputText.trim())
  const hasSubCalls = !!(call.subCalls && call.subCalls.length > 0)
  const resultText = subagentResultText(call)
  const ended = call.subagentStatus === "failed" || call.subagentStatus === "stopped" ? call.subagentStatus : undefined
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
        {ended && <span className="text-[11px] text-muted-foreground/50 shrink-0">{ended}</span>}
      </button>
      {open && (
        <div className="ml-3 mt-0.5 border-l border-border/50 pl-3 space-y-1.5">
          {prompt && <AgentPromptBlock prompt={prompt} />}
          {hasSubCalls && (
            <div className="space-y-0.5">
              {call.subCalls!.map((sub) => (
                <ToolCallRow key={sub.id} call={sub} isStreaming={isRunning} />
              ))}
            </div>
          )}
          {/* Human-readable text streamed by this sub-agent — kept tied to its row */}
          {hasOutputText && (
            <div className="mt-1 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
              <MarkdownContent content={stripHuxfluxTags(call.outputText!)} />
            </div>
          )}
          {isRunning && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 min-w-0">
              <IconLoader2 size={11} className="animate-spin shrink-0" />
              <span className="truncate">{call.subagentProgress ?? "Working…"}</span>
            </div>
          )}
          {/* Final result summary, once the sub-agent has finished */}
          {resultText && <ResultBlock result={resultText} />}
        </div>
      )}
    </div>
  )
}

export function ToolCallRow({ call, indent = false, isStreaming = false }: { call: ToolCall; indent?: boolean; isStreaming?: boolean }) {
  if (isAgentTool(call.tool)) {
    return <AgentToolCallRow call={call} indent={indent} isStreaming={isStreaming} />
  }

  const { title, detail, hasDescription } = formatToolCall(call.tool, call.args)
  // The model's own description of an in-flight call shimmers so the eye
  // lands on what it is doing, not on the raw command next to it.
  const isRunning = isToolCallRunning(call, isStreaming)
  return (
    <div className={cn("mt-0.5", indent && "ml-4")}>
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground py-0.5 min-w-0">
        {toolIcon(call.tool)}
        <span className={cn("font-medium shrink-0", isRunning && hasDescription ? "text-shimmer" : "text-foreground/70")}>{title}</span>
        {detail && (
          <span className="font-mono text-[11px] text-muted-foreground/60 truncate min-w-0">
            {detail}
          </span>
        )}
      </div>
      {call.result && (call.tool === "AskUserQuestion"
        ? <AskUserQuestionResult args={call.args} result={call.result} fallback={<ResultBlock result={call.result} />} />
        : <ResultBlock result={call.result} />)}
    </div>
  )
}
