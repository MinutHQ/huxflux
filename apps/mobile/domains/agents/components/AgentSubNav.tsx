import { View, Text, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { Message } from "@huxflux/shared"
import { c } from "@/theme"
import type { ChatTab } from "../agents.types"
import { ContextIndicator } from "./ContextIndicator"

interface SubNavItem {
  label: string
  tab: ChatTab
  icon: keyof typeof Ionicons.glyphMap
  iconFocused: keyof typeof Ionicons.glyphMap
}

export function AgentSubNav({
  activeTab,
  onSelect,
  fileChangesCount,
  messages,
}: {
  activeTab: ChatTab
  onSelect: (tab: ChatTab) => void
  fileChangesCount: number
  messages: Message[]
}) {
  const items: SubNavItem[] = [
    { label: "Chat", tab: "chat", icon: "sparkles-outline", iconFocused: "sparkles" },
    { label: `Files${fileChangesCount ? ` (${fileChangesCount})` : ""}`, tab: "files", icon: "code-slash-outline", iconFocused: "code-slash" },
    { label: "PR", tab: "pr", icon: "git-pull-request-outline", iconFocused: "git-pull-request" },
    { label: "Terminal", tab: "terminal", icon: "terminal-outline", iconFocused: "terminal" },
  ]

  return (
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16, gap: 4, paddingTop: 4 }}>
      {items.map(({ label, tab, icon, iconFocused }) => (
        <TouchableOpacity
          key={tab}
          onPress={() => onSelect(tab)}
          style={{ paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: activeTab === tab ? 2 : 0, borderBottomColor: c.fg, flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <Ionicons name={activeTab === tab ? iconFocused : icon} size={13} color={activeTab === tab ? c.fg : c.fgSub} />
          <Text style={{ color: activeTab === tab ? c.fg : c.fgSub, fontSize: 13, fontWeight: activeTab === tab ? "600" : "400" }}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={{ flex: 1 }} />
      <ContextIndicator messages={messages} />
    </View>
  )
}
