import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useState } from "react"
import type { ToolCall } from "@huxflux/shared"
import { c } from "@/theme"
import { formatToolCall } from "../utils"
import { MessageContent } from "./MessageContent"

export function ToolCallRow({ call, isStreaming = false }: { call: ToolCall; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const isAgent = call.tool === "Agent"
  const isRunning = isStreaming && !call.result
  const hasOutputText = !!(call.outputText && call.outputText.trim())
  const hasSubCalls = !!(call.subCalls && call.subCalls.length > 0)

  const name = isAgent
    ? (() => { try { return JSON.parse(call.args ?? "{}").description ?? call.tool } catch { return call.tool } })()
    : call.tool
  const { title: fmtTitle, detail: fmtDetail } = isAgent ? { title: name, detail: "" } : formatToolCall(call.tool, call.args)

  if (isAgent) {
    return (
      <View style={{ marginTop: 2 }}>
        <TouchableOpacity
          onPress={() => setExpanded(v => !v)}
          activeOpacity={0.7}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 }}
        >
          <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={11} color={c.fgSub} />
          {isRunning
            ? <ActivityIndicator size="small" color={c.fgSub} style={{ width: 12, height: 12 }} />
            : <Ionicons name="sparkles-outline" size={11} color={c.fgSub} />}
          <Text style={{ color: c.fg, fontSize: 12, fontWeight: "500", flex: 1 }} numberOfLines={1}>{name}</Text>
        </TouchableOpacity>
        {expanded && (
          <View style={{ marginLeft: 12, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: c.border, gap: 4, marginTop: 2 }}>
            {hasSubCalls && (
              <View style={{ gap: 2 }}>
                {call.subCalls!.map((sub) => (
                  <ToolCallRow key={sub.id} call={sub} isStreaming={isStreaming} />
                ))}
              </View>
            )}
            {hasOutputText && (
              <View style={{ marginTop: 2 }}>
                <MessageContent text={call.outputText!} />
              </View>
            )}
            {isRunning && !hasOutputText && !hasSubCalls && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}>
                <ActivityIndicator size="small" color={c.fgSub} style={{ width: 11, height: 11 }} />
                <Text style={{ color: c.fgSub, fontSize: 11 }}>Working…</Text>
              </View>
            )}
            {call.result && (
              <Text style={{ color: c.fgSub, fontSize: 11, fontStyle: "italic" }} numberOfLines={2}>
                {call.result.trim()}
              </Text>
            )}
          </View>
        )}
      </View>
    )
  }

  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.7}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 3 }}
    >
      {isRunning
        ? <ActivityIndicator size="small" color="#f59e0b" style={{ width: 12, height: 12, marginTop: 2 }} />
        : <Text style={{ color: call.result != null ? "#34d399" : "#f59e0b", fontSize: 10, marginTop: 3 }}>{call.result != null ? "✓" : "○"}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace" }} numberOfLines={1}>{fmtTitle}</Text>
        {fmtDetail ? (
          <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", opacity: 0.6, marginTop: 1 }} numberOfLines={1}>{fmtDetail}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}
