import { View, Text, TextInput } from "react-native"
import { useState, useEffect, useRef } from "react"
import { api } from "@huxflux/shared"
import { c } from "@/theme"
import { SectionLabel } from "./SettingsRow"

export function ReviewPromptSection() {
  const [reviewPrompt, setReviewPrompt] = useState("")
  const [reviewSaved, setReviewSaved] = useState(false)
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.settings.current().then((s) => {
      setReviewPrompt(s.reviewPrompt ?? "")
    }).catch(() => {})
  }, [])

  function handleReviewPromptChange(text: string) {
    setReviewPrompt(text)
    setReviewSaved(false)
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current)
    reviewTimerRef.current = setTimeout(() => {
      api.settings.update({ reviewPrompt: text }).then(() => setReviewSaved(true))
    }, 800)
  }

  return (
    <View>
      <SectionLabel label="Review" />
      <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>Review prompt</Text>
          {reviewSaved && <Text style={{ color: c.fgSub, fontSize: 11 }}>Saved</Text>}
        </View>
        <Text style={{ color: c.fgSub, fontSize: 12, marginBottom: 8, lineHeight: 16 }}>
          Custom instructions injected into every AI code review.
        </Text>
        <TextInput
          value={reviewPrompt}
          onChangeText={handleReviewPromptChange}
          placeholder="e.g. Focus on security and performance issues..."
          placeholderTextColor={c.placeholder}
          multiline
          style={{
            backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8,
            padding: 12, color: c.fg, fontSize: 13, minHeight: 100, textAlignVertical: "top",
            lineHeight: 18,
          }}
        />
      </View>
    </View>
  )
}
