import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Linking, ScrollView, Switch } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getActiveServer, getServers, useServerConfig, api } from "@huxflux/shared"
import { useState, useEffect, useRef } from "react"
import { c, themes, useTheme } from "../../theme"
import { useModal } from "../../components/Modal"
import { prefs } from "../../lib/prefs"

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

function SectionLabel({ label }: { label: string }) {
  return (
    <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
      {label}
    </Text>
  )
}

function SettingRow({ label, description, value, onValueChange }: {
  label: string
  description?: string
  value: boolean
  onValueChange: (v: boolean) => void
}) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border,
    }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
        {description ? <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: c.border, true: c.fgBright }}
        thumbColor={c.bg}
      />
    </View>
  )
}

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const server = getActiveServer()
  const servers = getServers()
  const { feedbackEnabled } = useServerConfig()
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const { themeId, setThemeId } = useTheme()

  // General prefs
  const [stripYoureRight, setStripYoureRightState] = useState(() => prefs.getStripYoureRight())
  const [alwaysContext, setAlwaysContextState] = useState(() => prefs.getAlwaysContext())
  const [autoConvert, setAutoConvertState] = useState(() => prefs.getAutoConvert())

  // Git prefs
  const [gitAutoPush, setGitAutoPushState] = useState(() => prefs.getGitAutoPush())
  const [gitDeleteBranch, setGitDeleteBranchState] = useState(() => prefs.getGitDeleteBranch())
  const [gitArchiveOnMerge, setGitArchiveOnMergeState] = useState(() => prefs.getGitArchiveOnMerge())

  // Review prompt
  const [reviewPrompt, setReviewPromptState] = useState("")
  const [reviewSaved, setReviewSaved] = useState(false)
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.getSettings().then((s) => {
      setReviewPromptState(s.reviewPrompt ?? "")
    }).catch(() => {})
  }, [])

  function handleReviewPromptChange(text: string) {
    setReviewPromptState(text)
    setReviewSaved(false)
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current)
    reviewTimerRef.current = setTimeout(() => {
      api.updateSettings({ reviewPrompt: text }).then(() => setReviewSaved(true))
    }, 800)
  }

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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20 }}>
        {/* Server */}
        <View>
          <SectionLabel label="Server" />
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

        {/* General */}
        <View>
          <SectionLabel label="General" />
          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
            <SettingRow
              label="Auto-convert long text"
              description="Convert pasted text over 5000 characters into text attachments"
              value={autoConvert}
              onValueChange={(v) => { setAutoConvertState(v); prefs.setAutoConvert(v) }}
            />
            <SettingRow
              label="I'm not absolutely right, thank you very much"
              description={'Strip "You\'re absolutely right!" from AI messages'}
              value={stripYoureRight}
              onValueChange={(v) => { setStripYoureRightState(v); prefs.setStripYoureRight(v) }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>Always show context usage</Text>
                <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>
                  Always show context percent used. By default shown only when &gt;70% used.
                </Text>
              </View>
              <Switch
                value={alwaysContext}
                onValueChange={(v) => { setAlwaysContextState(v); prefs.setAlwaysContext(v) }}
                trackColor={{ false: c.border, true: c.fgBright }}
                thumbColor={c.bg}
              />
            </View>
          </View>
        </View>

        {/* Git */}
        <View>
          <SectionLabel label="Git" />
          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
            <SettingRow
              label="Auto-push after commit"
              description="Automatically push to remote after each commit"
              value={gitAutoPush}
              onValueChange={(v) => { setGitAutoPushState(v); prefs.setGitAutoPush(v) }}
            />
            <SettingRow
              label="Delete branch on archive"
              description="Delete the git branch when an agent is archived"
              value={gitDeleteBranch}
              onValueChange={(v) => { setGitDeleteBranchState(v); prefs.setGitDeleteBranch(v) }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>Archive on merge</Text>
                <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>
                  Automatically archive agents when their PR is merged
                </Text>
              </View>
              <Switch
                value={gitArchiveOnMerge}
                onValueChange={(v) => { setGitArchiveOnMergeState(v); prefs.setGitArchiveOnMerge(v) }}
                trackColor={{ false: c.border, true: c.fgBright }}
                thumbColor={c.bg}
              />
            </View>
          </View>
        </View>

        {/* Review */}
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

        {/* Theme */}
        {[
          { label: "Dark Themes", items: themes.filter((t) => !t.light) },
          { label: "Light Themes", items: themes.filter((t) => t.light) },
        ].map((section) => (
          <View key={section.label}>
            <SectionLabel label={section.label} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {section.items.map((t) => {
                const active = t.id === themeId
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setThemeId(t.id)}
                    style={{ width: 72, alignItems: "center", gap: 6 }}
                  >
                    <View style={{
                      width: 48, height: 48, borderRadius: 12,
                      backgroundColor: t.palette.bg,
                      borderWidth: 2,
                      borderColor: active ? t.palette.fgBright : t.light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
                      justifyContent: "center", alignItems: "center",
                      overflow: "hidden",
                    }}>
                      <View style={{ flexDirection: "row", gap: 3 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.palette.fgBright }} />
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.palette.card }} />
                      </View>
                      <View style={{ width: 20, height: 3, borderRadius: 1.5, backgroundColor: t.palette.fg, marginTop: 4, opacity: 0.6 }} />
                      <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: t.palette.fgSub, marginTop: 2, opacity: 0.4 }} />
                    </View>
                    <Text style={{
                      color: active ? c.fg : c.fgSub,
                      fontSize: 11,
                      fontWeight: active ? "600" : "400",
                      textAlign: "center",
                    }} numberOfLines={1}>
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}

        {/* Feedback */}
        {feedbackEnabled && (
          <View>
            <SectionLabel label="Feedback" />
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
      </ScrollView>

      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
    </View>
  )
}
