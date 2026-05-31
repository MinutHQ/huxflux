import { View, Text, TouchableOpacity, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useServerConfig } from "@huxflux/shared"
import { useState } from "react"
import { c } from "@/theme"
import { FeedbackModal } from "../components/FeedbackModal"
import { SectionLabel } from "../components/SettingsRow"
import { SettingsServerCard } from "../components/SettingsServerCard"
import { GeneralSection, GitSection } from "../components/GeneralSection"
import { ReviewPromptSection } from "../components/ReviewPromptSection"
import { ThemePicker } from "../components/ThemePicker"

function FeedbackCard({ onOpen }: { onOpen: () => void }) {
  return (
    <View>
      <SectionLabel label="Feedback" />
      <TouchableOpacity
        onPress={onOpen}
        style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="chatbubble-outline" size={18} color={c.fgSub} />
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>Send Feedback</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.fgSub} />
      </TouchableOpacity>
    </View>
  )
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { feedbackEnabled } = useServerConfig()
  const [feedbackVisible, setFeedbackVisible] = useState(false)

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        paddingTop: insets.top + 10,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: c.card,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", letterSpacing: -0.4 }}>Settings</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20 }}>
        <SettingsServerCard />
        <GeneralSection />
        <GitSection />
        <ReviewPromptSection />
        <ThemePicker />
        {feedbackEnabled && <FeedbackCard onOpen={() => setFeedbackVisible(true)} />}
      </ScrollView>

      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
    </View>
  )
}
