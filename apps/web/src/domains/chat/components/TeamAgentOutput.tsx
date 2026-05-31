import { useEffect, useRef, useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconBolt,
  IconChevronRight,
  IconLoader2,
} from "@tabler/icons-react"
import type { TeamAgent } from "../chat.types"
import { MarkdownContent } from "./MarkdownContent"
import { ToolCallRow } from "./ToolCallRow"

interface TeamAgentToolsProps {
  subCalls: TeamAgent["subCalls"]
  status: TeamAgent["status"]
  toolsOpen: boolean
  onToggle: () => void
}

function TeamAgentTools({ subCalls, status, toolsOpen, onToggle }: TeamAgentToolsProps) {
  const calls = subCalls ?? []
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-left py-0.5"
      >
        <IconChevronRight size={11} className={cn("transition-transform shrink-0", toolsOpen && "rotate-90")} />
        {status === "running"
          ? <IconLoader2 size={11} className="text-muted-foreground/70 shrink-0 animate-spin" />
          : <IconBolt size={11} className="text-muted-foreground/50 shrink-0" />}
        <span className="font-medium text-foreground/70">
          {calls.length === 1 ? "1 tool call" : `${calls.length} tool calls`}
        </span>
      </button>
      {toolsOpen && (
        <div className="mt-0.5 ml-3 border-l border-border/50 pl-3 space-y-0.5">
          {calls.map((sub) => (
            <ToolCallRow key={sub.id} call={sub} />
          ))}
        </div>
      )}
    </div>
  )
}

export function TeamAgentOutput({ selected }: { selected: TeamAgent }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [toolsOpen, setToolsOpen] = useState(true)
  const [toolsUserToggled, setToolsUserToggled] = useState(false)
  const hasSubCalls = selected.subCalls && selected.subCalls.length > 0
  const subCallCount = selected.subCalls?.length ?? 0
  const hasOutput = selected.outputText && selected.outputText.trim()
  const hasResult = selected.result && selected.result.trim()

  // Collapse tools accordion when agent finishes, or once 10+ sub-calls have accrued
  useEffect(() => {
    if (toolsUserToggled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: collapse the inner tools accordion once the agent finishes or has accrued enough calls
    if (selected.status === "done" || subCallCount >= 10) setToolsOpen(false)
    else setToolsOpen(true)
  }, [selected.status, subCallCount, toolsUserToggled])

  // Auto-scroll when content changes
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [selected.subCalls?.length, selected.outputText, selected.result])

  return (
    <div ref={scrollRef} className="max-h-56 overflow-y-auto px-4 py-3 space-y-2">
      {/* Task description */}
      {selected.prompt && (
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-2">{selected.prompt}</p>
      )}

      {/* Tool calls accordion */}
      {hasSubCalls && (
        <TeamAgentTools
          subCalls={selected.subCalls}
          status={selected.status}
          toolsOpen={toolsOpen}
          onToggle={() => { setToolsOpen(!toolsOpen); setToolsUserToggled(true) }}
        />
      )}

      {/* Text output streamed by the sub-agent */}
      {hasOutput && (
        <div className="text-[11px] text-foreground/80 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[10px] [&_pre]:text-[10px]">
          <MarkdownContent content={selected.outputText ?? ""} />
        </div>
      )}

      {/* Final result */}
      {hasResult && !hasOutput && (
        <pre className="text-[11px] font-mono text-foreground/70 leading-relaxed whitespace-pre-wrap">{selected.result}</pre>
      )}

      {/* Idle placeholder */}
      {selected.status === "running" && !hasSubCalls && !hasOutput && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
          <IconLoader2 size={12} className="animate-spin" />
          <span>Running in background…</span>
        </div>
      )}
    </div>
  )
}
