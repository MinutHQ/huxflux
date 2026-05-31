import { View, Text, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useState } from "react"
import { c } from "@/theme"

export function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = thinking.slice(0, 120).replace(/\n/g, " ")
  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.8}
      style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, marginBottom: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="bulb-outline" size={11} color={c.fgSub} />
        <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", flex: 1 }}>Thinking</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={10} color={c.fgSub} />
      </View>
      {expanded ? (
        <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 18, marginTop: 6, fontStyle: "italic" }}>
          {thinking}
        </Text>
      ) : (
        <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 18, marginTop: 4, fontStyle: "italic" }} numberOfLines={2}>
          {preview}{thinking.length > 120 ? "…" : ""}
        </Text>
      )}
    </TouchableOpacity>
  )
}
