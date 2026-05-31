import { View, Text } from "react-native"
import type { Message } from "@huxflux/shared"
import { prefs } from "@/lib/prefs"
import { CLAUDE_CONTEXT_TOKENS } from "../utils"

export function ContextIndicator({ messages }: { messages: Message[] }) {
  const latest = [...messages].reverse().find((m) => m.role === "assistant" && m.inputTokens != null)
  const tokens = latest?.inputTokens ?? 0
  const pct = Math.min(tokens / CLAUDE_CONTEXT_TOKENS, 1)
  const alwaysShow = prefs.getAlwaysContext()
  if (tokens === 0 || (!alwaysShow && pct < 0.7)) return null
  const color = pct >= 0.9 ? "#f87171" : pct >= 0.7 ? "#facc15" : "#60a5fa"
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 8, justifyContent: "flex-end" }}>
      <Text style={{ color, fontSize: 10, fontWeight: "600" }}>{Math.round(pct * 100)}%</Text>
    </View>
  )
}
