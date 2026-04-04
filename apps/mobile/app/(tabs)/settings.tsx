import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Linking } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getActiveServer, getServers, useServerConfig, api } from "@huxflux/shared"
import { useState } from "react"
import { c } from "../../theme"
import { useModal } from "../../components/Modal"

function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const modal = useModal()

  async function handleSubmit() {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const result = await api.submitFeedback({ title: title.trim(), body: body.trim() || undefined })
      setTitle("")
      setBody("")
      onClose()
      if ((result as any)?.url) {
        modal.showAlert("Feedback sent", "View it on GitHub?", [
          { label: "Open", onPress: () => Linking.openURL((result as any).url) },
          { label: "OK", style: "cancel" as const },
        ])
      } else {
        modal.showAlert("Feedback sent", "Thanks for the report.")
      }
    } catch (e: any) {
      modal.showAlert("Error", e.message ?? "Failed to submit feedback")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: c.fg, fontSize: 17, fontWeight: "600" }}>Send Feedback</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={c.fgSub} />
            </TouchableOpacity>
          </View>

          <Text style={{ color: c.fgSub, fontSize: 12, marginBottom: 4 }}>Title *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Bug report or suggestion"
            placeholderTextColor={c.placeholder}
            style={{
              backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8,
              padding: 12, color: c.fg, fontSize: 14, marginBottom: 12,
            }}
          />

          <Text style={{ color: c.fgSub, fontSize: 12, marginBottom: 4 }}>Details</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Optional description"
            placeholderTextColor={c.placeholder}
            multiline
            style={{
              backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8,
              padding: 12, color: c.fg, fontSize: 14, marginBottom: 16, minHeight: 80, textAlignVertical: "top",
            }}
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting || !title.trim()}
            style={{
              backgroundColor: title.trim() && !submitting ? c.fgBright : c.secondary,
              borderRadius: 10, paddingVertical: 12, alignItems: "center",
            }}
          >
            {submitting
              ? <ActivityIndicator color={c.bg} />
              : <Text style={{ color: title.trim() ? c.bg : c.fgSub, fontWeight: "600", fontSize: 14 }}>Submit</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const server = getActiveServer()
  const servers = getServers()
  const { feedbackEnabled } = useServerConfig()
  const [feedbackVisible, setFeedbackVisible] = useState(false)

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
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

      <View style={{ padding: 16, gap: 20 }}>
        {/* Server */}
        <View>
          <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Server
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/servers")}
            style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>
                {server ? server.name : "No server connected"}
              </Text>
              {server && <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{server.url}</Text>}
              <Text style={{ color: c.fgSub, fontSize: 11, marginTop: 4 }}>{servers.length} server{servers.length !== 1 ? "s" : ""} configured</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.fgSub} />
          </TouchableOpacity>
        </View>

        {/* Feedback */}
        {feedbackEnabled && (
          <View>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Feedback
            </Text>
            <TouchableOpacity
              onPress={() => setFeedbackVisible(true)}
              style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="chatbubble-outline" size={18} color={c.fgSub} />
                <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>Send Feedback</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.fgSub} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
    </View>
  )
}
