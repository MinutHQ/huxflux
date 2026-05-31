import { View, Text } from "react-native"
import { memo } from "react"
import type { Message } from "@huxflux/shared"
import { c } from "@/theme"
import { MessageContent } from "./MessageContent"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallsList } from "./ToolCallsList"

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
        <View style={{ backgroundColor: c.secondary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "80%" }}>
          <Text style={{ color: c.fg, fontSize: 14, lineHeight: 20 }}>{message.content}</Text>
        </View>
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
