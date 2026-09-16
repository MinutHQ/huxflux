import React from "react"
import { IconBolt, IconPaperclip } from "@tabler/icons-react"
import type { Message } from "@huxflux/shared"
import { AssistantBubble } from "./AssistantBubble"
import { LinkedWorkspaceMessage } from "./LinkedWorkspaceMessage"

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

function UserBubble({ content, injected }: { content: string; injected?: boolean }) {
  const { files, displayText } = parseUserContent(content)
  return (
    <div className="mb-5 ml-auto w-fit max-w-[80%]">
      {injected && (
        <div className="flex items-center justify-end gap-1 mb-1 text-[10px] text-muted-foreground/60">
          <IconBolt size={11} />
          <span>Delivered to the running agent</span>
        </div>
      )}
    <div className="bg-card border border-border rounded-xl px-5 py-4 space-y-3">
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

  if (isUser) return <UserBubble content={msg.content} injected={msg.injected} />

  // Empty in-flight assistant message — nothing yet, typing bubble shown separately
  if (isEmpty) return null

  return <AssistantBubble msg={msg} isStreaming={isStreaming} hasPending={hasPending} pendingText={pendingText} />
})
