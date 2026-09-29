import { View, Text } from "react-native"
import { memo } from "react"
import { parseAttachedFiles, type Message } from "@huxflux/shared"
import { c } from "@/theme"
import { MessageContent } from "./MessageContent"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallsList } from "./ToolCallsList"
import { AttachmentImage } from "./AttachmentImage"

function UserBubble({ content }: { content: string }) {
  const { files, text } = parseAttachedFiles(content)
  const displayText = text.trim()
  return (
    <View style={{ alignItems: "flex-end", gap: 6, maxWidth: "80%" }}>
      {files.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 }}>
          {files.map((f) => <AttachmentImage key={f.path} file={f} size={112} />)}
        </View>
      )}
      {displayText ? (
        <View style={{ backgroundColor: c.secondary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ color: c.fg, fontSize: 14, lineHeight: 20 }}>{displayText}</Text>
        </View>
      ) : null}
    </View>
  )
}

export const MessageBubble = memo(function MessageBubble({ message, isStreaming: isStreamingProp }: {
  message: Message
  isStreaming?: boolean
}) {
  const isUser = message.role === "user"
  // Clamp: if durationMs is set, the message is definitively done even if
  // the parent's isStreaming hasn't flipped yet.
  const isStreaming = !!isStreamingProp && message.durationMs == null
  const toolCalls = message.toolCalls ?? []
  const pendingText = message.pendingText ?? ""
  const hasPending = pendingText.trim().length > 0
  const hasContent = !!message.content

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: isUser ? "flex-end" : "flex-start" }}>
      {isUser ? (
        <UserBubble content={message.content} />
      ) : (
        <View style={{ maxWidth: "94%" }}>
          {/* Thinking block */}
          {message.thinking ? <ThinkingBlock thinking={message.thinking} /> : null}

          {/* Tool calls + live streaming text */}
          {(toolCalls.length > 0 || (isStreaming && hasPending)) && (
            <ToolCallsList
              calls={toolCalls}
              hasContent={hasContent}
              isStreaming={isStreaming}
              pendingText={pendingText}
            />
          )}

          {/* Content */}
          {hasContent ? (
            <MessageContent text={message.content} />
          ) : toolCalls.length === 0 && !hasPending ? (
            <View style={{ flexDirection: "row", gap: 4, paddingVertical: 4 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.secondary }} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
})
