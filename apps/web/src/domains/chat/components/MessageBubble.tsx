import React from "react"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import {
  IconCopy,
  IconPaperclip,
} from "@tabler/icons-react"
import type { Message } from "@huxflux/shared"
import { getStripYoureRight } from "@/lib/notificationPrefs"
import { stripHuxfluxTags } from "../utils"
import { LinkedWorkspaceMessage } from "./LinkedWorkspaceMessage"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallsAccordion } from "./ToolCallsAccordion"
import { PRCreatedCard } from "./PRCreatedCard"
import { TurnDiffSummary } from "./TurnDiffSummary"
import { MarkdownContent } from "./MarkdownContent"

interface UserMessageParts {
  files: { name: string }[]
  displayText: string
}

function parseUserContent(content: string): UserMessageParts {
  // Parse out "Attached files:\n- name: /path\n...\n\n---\n\n" prefix
  const attachmentMatch = content.match(/^Attached files:\n([\s\S]*?)\n\n---\n\n([\s\S]*)$/)
  const remainder = attachmentMatch ? attachmentMatch[2] : content
  const linkedAgentMatch = remainder.match(/^([\s\S]*?)\n\n---\n\nLinked agents for cross-repo collaboration:\n[\s\S]*$/)

  const files: { name: string }[] = attachmentMatch
    ? (attachmentMatch[1].split("\n").filter(Boolean).map((line) => {
        const m = line.match(/^- (.+?): /)
        return m ? { name: m[1] } : null
      }).filter(Boolean) as { name: string }[])
    : []

  const displayText = linkedAgentMatch
    ? linkedAgentMatch[1].trim()
    : remainder.replace(/\n\n---\n\nLinked agents[\s\S]*$/, "").trim()

  return { files, displayText }
}

function UserBubble({ content }: { content: string }) {
  const { files, displayText } = parseUserContent(content)
  return (
    <div className="mb-5 ml-auto w-fit max-w-[80%] bg-card border border-border rounded-xl px-5 py-4 space-y-3">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <div key={f.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-[11px]">
              <IconPaperclip size={12} className="text-muted-foreground/60 shrink-0" />
              <span className="font-medium text-foreground/80 max-w-[160px] truncate">{f.name}</span>
            </div>
          ))}
        </div>
      )}
      {displayText && (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {displayText.split(/(@[\w./-]+)/g).map((part, i) =>
            /^@[\w./-]+$/.test(part)
              ? <span key={i} className="font-mono text-[12px] text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">{part}</span>
              : part
          )}
        </p>
      )}
    </div>
  )
}

function MessageMetadata({ msg }: { msg: Message }) {
  return (
    <PopoverContent align="start" className="w-56 text-xs p-3 space-y-2">
      {msg.model && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Model</span>
          <span className="font-medium">{msg.model}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Time</span>
        <span className="font-medium">{msg.timestamp}</span>
      </div>
      {(msg.inputTokens != null || msg.outputTokens != null) && (
        <div className="border-t pt-2 space-y-1.5">
          {msg.inputTokens != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input</span>
              <span className="font-medium">{msg.inputTokens.toLocaleString()}</span>
            </div>
          )}
          {msg.outputTokens != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output</span>
              <span className="font-medium">{msg.outputTokens.toLocaleString()}</span>
            </div>
          )}
          {msg.cacheReadTokens != null && msg.cacheReadTokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache read</span>
              <span className="font-medium">{msg.cacheReadTokens.toLocaleString()}</span>
            </div>
          )}
          {msg.cacheWriteTokens != null && msg.cacheWriteTokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache write</span>
              <span className="font-medium">{msg.cacheWriteTokens.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </PopoverContent>
  )
}

function AssistantFooter({ msg }: { msg: Message }) {
  return (
    <div className="flex items-center gap-1.5 mt-2.5">
      {msg.durationMs != null && (
        <>
          <Popover>
            <PopoverTrigger className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors cursor-pointer select-none">
              {msg.durationMs < 1000 ? `${msg.durationMs}ms` : `${(msg.durationMs / 1000).toFixed(0)}s`}
            </PopoverTrigger>
            <MessageMetadata msg={msg} />
          </Popover>
          <span className="text-muted-foreground/25">·</span>
        </>
      )}
      {msg.model && (
        <>
          <span className="text-[11px] text-muted-foreground/40">{msg.model}</span>
          <span className="text-muted-foreground/25">·</span>
        </>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground/40 hover:text-muted-foreground/80"
        onClick={() => navigator.clipboard.writeText(msg.content)}
      >
        <IconCopy size={12} />
      </Button>
    </div>
  )
}

function AssistantBubble({ msg, isStreaming, hasPending, pendingText }: { msg: Message; isStreaming: boolean; hasPending: boolean; pendingText: string }) {
  return (
    <div className="mb-5 max-w-4xl">
      {/* Thinking */}
      {msg.thinking && <ThinkingBlock text={msg.thinking} />}

      {/* Tool calls + live streaming text. Show whenever there are tool
          calls, OR while a streaming chunk is in flight (so intermediate
          text gets a home before the first tool call exists). */}
      {((msg.toolCalls && msg.toolCalls.length > 0) || (isStreaming && hasPending)) && (
        <ToolCallsAccordion
          calls={msg.toolCalls ?? []}
          hasContent={!!msg.content}
          isStreaming={isStreaming}
          pendingText={pendingText}
        />
      )}

      {/* PR created card */}
      {msg.content && !isStreaming && <PRCreatedCard content={msg.content} />}

      {/* Content */}
      {msg.content && (
        <div className="text-sm text-foreground leading-relaxed">
          <MarkdownContent content={stripHuxfluxTags(getStripYoureRight()
            ? msg.content.replace(/^(You're (absolutely |completely |totally |entirely )?right[!.,]?\s*)+/i, "")
            : msg.content)}
          />
        </div>
      )}

      {/* Turn diff summary — collapsible inline diffs for edits in this turn */}
      {!isStreaming && msg.toolCalls && msg.toolCalls.length > 0 && (
        <TurnDiffSummary calls={msg.toolCalls} />
      )}

      <AssistantFooter msg={msg} />
    </div>
  )
}

export const MessageBubble = React.memo(function MessageBubble({ msg, isStreaming: isStreamingProp }: { msg: Message; isStreaming?: boolean }) {
  const isUser = msg.role === "user"
  // Belt-and-braces: even if the parent's derived isStreaming hasn't flipped
  // yet (cache update race), `durationMs` being set means this message is
  // definitively done — clamp the spinner state locally.
  const isStreaming = !!isStreamingProp && msg.durationMs == null
  const pendingText = msg.pendingText ?? ""
  const hasPending = pendingText.trim().length > 0
  // A non-streaming message with only tool calls and no text/thinking is not shown —
  // the tool calls accordion only renders alongside actual content (see below).
  const isEmpty = !msg.content && !msg.thinking && !hasPending && (!msg.toolCalls || msg.toolCalls.length === 0)

  // Messages from linked workspaces — collapsed accordion
  if (isUser && msg.sender) {
    const isSystem = msg.sender === "PR Review" || msg.sender === "CI Monitor" || msg.sender === "Merge Conflict"
    return <LinkedWorkspaceMessage sender={msg.sender} content={msg.content} icon={isSystem ? "system" : "workspace"} />
  }

  if (isUser) return <UserBubble content={msg.content} />

  // Empty in-flight assistant message — nothing yet, typing bubble shown separately
  if (isEmpty) return null

  return <AssistantBubble msg={msg} isStreaming={isStreaming} hasPending={hasPending} pendingText={pendingText} />
})
