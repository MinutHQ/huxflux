import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useState, useEffect } from "react"
import type { ToolCall } from "@huxflux/shared"
import { c } from "@/theme"
import { MessageContent } from "./MessageContent"
import { ToolCallRow } from "./ToolCallRow"

export function ToolCallsList({ calls, hasContent, isStreaming, pendingText }: {
  calls: ToolCall[]
  hasContent: boolean
  isStreaming?: boolean
  pendingText?: string
}) {
  const [open, setOpen] = useState(!!isStreaming)
  const [userToggled, setUserToggled] = useState(false)
  const label = calls.length === 0 ? "Working…" : calls.length === 1 ? "1 tool call" : `${calls.length} tool calls`
  const lastCall = calls[calls.length - 1]
  const summary = lastCall ? (lastCall.tool === "Agent"
    ? (() => { try { return JSON.parse(lastCall.args ?? "{}").description ?? lastCall.tool } catch { return lastCall.tool } })()
    : lastCall.tool) : ""

  // Stay open while streaming; collapse when done. User toggle wins.
  useEffect(() => {
    if (userToggled) return
    // Sync UI to external streaming state until the user takes manual control.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(!!isStreaming)
  }, [isStreaming, userToggled])

  const hasPending = !!(pendingText && pendingText.trim())

  if (calls.length === 0 && !hasPending) return null

  return (
    <View style={{ marginBottom: hasContent ? 8 : 0 }}>
      <TouchableOpacity
        onPress={() => { setOpen(v => !v); setUserToggled(true) }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
        activeOpacity={0.7}
      >
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={11} color={c.fgSub} />
        {isStreaming
          ? <ActivityIndicator size="small" color={c.fgSub} style={{ width: 12, height: 12 }} />
          : <Ionicons name="flash-outline" size={11} color={c.fgSub} />}
        <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "500" }}>{label}</Text>
        {!open && summary ? <Text style={{ color: c.fgSub, fontSize: 11, opacity: 0.5, flex: 1 }} numberOfLines={1}>{summary}</Text> : null}
      </TouchableOpacity>
      {open && (
        <View style={{ marginLeft: 12, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: c.border, gap: 2 }}>
          {calls.map((tc, idx) => (
            <View key={tc.id}>
              {tc.precedingText && tc.precedingText.trim() ? (
                <View style={{ marginVertical: 4 }}>
                  <MessageContent text={tc.precedingText} />
                </View>
              ) : null}
              <ToolCallRow call={tc} isStreaming={isStreaming && idx === calls.length - 1} />
            </View>
          ))}
          {hasPending && (
            <View style={{ marginVertical: 4 }}>
              <MessageContent text={pendingText!} />
            </View>
          )}
        </View>
      )}
    </View>
  )
}
