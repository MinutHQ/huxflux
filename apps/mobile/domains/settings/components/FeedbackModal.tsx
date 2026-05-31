import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, useHuxfluxMutation } from "@huxflux/shared"
import { useState } from "react"
import { c } from "@/theme"
import { useModal } from "@/ui"

export function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const modal = useModal()

  const submitMut = useHuxfluxMutation<{ url?: string; number?: number }, { title: string; body?: string }>({
    mutationFn: (input) => api.settings.submitFeedback(input),
    onSuccess: (result) => {
      setTitle("")
      setBody("")
      onClose()
      if (result?.url) {
        modal.showAlert("Feedback sent", "View it on GitHub?", [
          { label: "Open", onPress: () => Linking.openURL(result.url!) },
          { label: "OK", style: "cancel" as const },
        ])
      } else {
        modal.showAlert("Feedback sent", "Thanks for the report.")
      }
    },
    onError: (e) => modal.showAlert("Error", e instanceof Error ? e.message : "Failed to submit feedback"),
  })
  const submitting = submitMut.isPending

  function handleSubmit() {
    if (!title.trim()) return
    submitMut.mutate({ title: title.trim(), body: body.trim() || undefined })
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
