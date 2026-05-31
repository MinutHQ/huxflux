import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Animated, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useState } from "react"
import { c } from "@/theme"
import { useSetupAnimations } from "./useSetupAnimations"
import { SetupParticles } from "./SetupParticles"
import { SETUP_STEPS } from "./setupSteps"

export interface CreatingState {
  repoId: string
  name: string
  branch: string
  repoName: string
}

export function SetupOverlay({ creating, onQueueMessage, queuedMessage }: {
  creating: CreatingState
  onQueueMessage?: (msg: string) => void
  queuedMessage?: string | null
}) {
  const [setupInput, setSetupInput] = useState("")
  const a = useSetupAnimations(creating.name)

  function submitSetup() {
    const text = setupInput.trim()
    if (text && onQueueMessage) {
      onQueueMessage(text)
      setSetupInput("")
    }
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: a.fadeIn }]}>
      <SetupParticles particles={a.particles} particleAnims={a.particleAnims} />

      {/* Floating icon cluster */}
      <Animated.View style={{ transform: [{ translateY: a.float }] }}>
        <Animated.View style={[styles.ring, { borderColor: "rgba(251,191,36,1)", transform: [{ scale: a.ring1Scale }], opacity: a.ring1Opacity }]} />
        <Animated.View style={[styles.ring, { borderColor: "rgba(96,165,250,1)", transform: [{ scale: a.ring2Scale }], opacity: a.ring2Opacity }]} />
        <Animated.View style={[styles.ring, { borderColor: "rgba(167,139,250,1)", transform: [{ scale: a.ring3Scale }], opacity: a.ring3Opacity }]} />

        <Animated.View style={[styles.orbitContainer, { transform: [{ rotate: a.orbitRotate }] }]}>
          <View style={styles.orbitDot1} />
        </Animated.View>
        <Animated.View style={[styles.orbitContainer, { transform: [{ rotate: a.orbit2Rotate }] }]}>
          <View style={styles.orbitDot2} />
        </Animated.View>

        <View style={[styles.iconBox, { backgroundColor: c.card }]}>
          <Text style={styles.hexIcon}>⬡</Text>
        </View>
      </Animated.View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={[styles.titleText, { color: c.fg }]}>
          {a.typedTitle}
          <Text style={styles.cursor}>|</Text>
        </Text>
        <Text style={[styles.branchText, { color: c.fgSub }]} numberOfLines={1}>
          {creating.branch}
        </Text>
      </View>

      {/* Terminal card */}
      <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}>
        <View style={[styles.cardHeader, { borderBottomColor: c.border }]}>
          <View style={styles.dot_red} />
          <View style={styles.dot_yellow} />
          <View style={styles.dot_green} />
          <Text style={[styles.repoLabel, { color: c.fgSub }]}>{creating.repoName}</Text>
        </View>

        <View style={styles.stepList}>
          {SETUP_STEPS.slice(0, a.visibleSteps).map((step, i) => {
            const isDone = i < a.completedSteps
            const isCurrent = i === a.visibleSteps - 1 && !isDone
            return (
              <View key={i} style={styles.stepRow}>
                <Text style={[styles.stepIcon, { color: c.fgSub }]}>{step.icon}</Text>
                <Text style={[styles.stepLabel, isDone ? { color: c.fgSub, opacity: 0.4 } : isCurrent ? { color: "#fbbf24" } : { color: c.fg, opacity: 0.7 }]}>
                  {step.label}
                </Text>
                {isDone && <Text style={styles.checkmark}>✓</Text>}
                {isCurrent && <ActivityIndicator size="small" color="#fbbf24" />}
              </View>
            )
          })}
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressTrack, { backgroundColor: c.secondary }]}>
            <Animated.View style={[styles.progressFill, { width: a.progressAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
          </View>
        </View>
      </View>

      {/* Chat input */}
      {onQueueMessage && (
        <View style={{ width: "100%", maxWidth: 320, marginTop: 12, paddingHorizontal: 16 }}>
          {queuedMessage ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 10 }}>
              <ActivityIndicator size="small" color="#fbbf24" />
              <Text style={{ color: c.fgSub, fontSize: 12, flex: 1 }} numberOfLines={1}>
                Will send: <Text style={{ color: c.fg }}>{queuedMessage}</Text>
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              <TextInput
                value={setupInput}
                onChangeText={setSetupInput}
                placeholder="Type your first message..."
                placeholderTextColor={c.fgSub + "50"}
                multiline
                style={{ color: c.fg, fontSize: 13, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, maxHeight: 100 }}
                returnKeyType="send"
                blurOnSubmit
                onSubmitEditing={submitSetup}
              />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8 }}>
                <Text style={{ color: c.fgSub, fontSize: 9, opacity: 0.5 }}>Sent once agent is ready</Text>
                <TouchableOpacity
                  onPress={submitSetup}
                  disabled={!setupInput.trim()}
                  style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: setupInput.trim() ? c.link : c.secondary }}
                >
                  <Ionicons name="send" size={13} color={setupInput.trim() ? "#fff" : c.fgSub} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: "#1c1917", alignItems: "center", justifyContent: "center", zIndex: 100 },
  ring: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1.5 },
  orbitContainer: { position: "absolute", left: 32, top: 32, width: 0, height: 0 },
  orbitDot1: { position: "absolute", left: 36, top: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(251,191,36,0.7)" },
  orbitDot2: { position: "absolute", left: 28, top: -2, width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(96,165,250,0.5)" },
  iconBox: { width: 64, height: 64, borderRadius: 16, borderWidth: 1, borderColor: "rgba(251,191,36,0.2)", alignItems: "center", justifyContent: "center" },
  hexIcon: { fontSize: 28, color: "#fbbf24" },
  titleContainer: { alignItems: "center", marginTop: 20, paddingHorizontal: 24 },
  titleText: { fontSize: 14, fontWeight: "600", fontFamily: "monospace", letterSpacing: 0.2 },
  cursor: { color: "rgba(251,191,36,0.7)" },
  branchText: { fontSize: 11, fontFamily: "monospace", marginTop: 4, opacity: 0.6 },
  card: { width: 300, marginTop: 20, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, gap: 6 },
  dot_red: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(248,113,113,0.5)" },
  dot_yellow: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(250,204,21,0.5)" },
  dot_green: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(74,222,128,0.5)" },
  repoLabel: { fontSize: 9, fontFamily: "monospace", marginLeft: 6, opacity: 0.4 },
  stepList: { padding: 12, gap: 6 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepIcon: { fontSize: 11, width: 16, opacity: 0.4 },
  stepLabel: { flex: 1, fontSize: 11, fontFamily: "monospace" },
  checkmark: { color: "#34d399", fontSize: 11 },
  progressContainer: { paddingHorizontal: 12, paddingBottom: 12 },
  progressTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: "#fbbf24" },
})
