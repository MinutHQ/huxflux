import { useState, useRef, useEffect, useMemo } from "react"
import {
  View, Text, TouchableOpacity,
  ActivityIndicator, Animated, Easing, StyleSheet,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useRepos, api, type Repo } from "@huxflux/shared"
import { useModal } from "../components/Modal"
import { FlashList } from "@shopify/flash-list"
import { c } from "../theme"

const BEE_ADJECTIVES = [
  "golden", "amber", "clover", "lavender", "sage", "thyme", "meadow",
  "misty", "swift", "bright", "busy", "wild", "pollen", "honey", "wax",
  "violet", "royal", "fuzzy", "striped", "sunlit", "drowsy", "hazy",
  "nimble", "plucky", "eager", "dusky", "velvet", "copper", "crimson",
  "ivory", "marbled", "silken", "frosted", "glossy", "humming", "dappled",
  "quiet", "restless", "brisk", "gentle", "wistful", "weary", "jolly",
  "quirky", "zesty", "tangy", "sugary", "minty", "buttery", "dusty",
  "earthen", "rustic", "woodland", "linen", "willow", "cedar", "juniper",
  "hazel", "birch", "rowan", "maple", "ember", "mossy", "fernlike",
  "breezy", "sunny", "stormy", "cloudy", "starlit", "moonlit", "dawnlit",
]
const BEE_NOUNS = [
  "scout", "forager", "guard", "worker", "drone", "nurse", "harvester",
  "wanderer", "pilgrim", "ranger", "keeper", "seeker", "drifter", "carrier",
  "gatherer", "builder", "mender", "tender", "weaver", "dancer", "singer",
  "climber", "flier", "rover", "hunter", "tracker", "watcher", "herald",
  "courier", "runner", "sifter", "sorter", "tinker", "cobbler", "scribe",
  "sage", "mystic", "dreamer", "poet", "jester", "acrobat", "trickster",
  "nomad", "voyager", "sailor", "captain", "mariner", "pathfinder", "shepherd",
  "gardener", "baker", "brewer", "smith", "potter", "carver", "painter",
]

function randomBeeName(): string {
  const adj = BEE_ADJECTIVES[Math.floor(Math.random() * BEE_ADJECTIVES.length)]
  const noun = BEE_NOUNS[Math.floor(Math.random() * BEE_NOUNS.length)]
  // 5-char base36 suffix adds ~60M possibilities per (adj, noun) pair,
  // making collisions astronomically unlikely and preventing stale-branch
  // name reuse from false-positive "already merged" detection.
  const suffix = Math.random().toString(36).slice(2, 7).padStart(5, "0")
  return `${adj}-${noun}-${suffix}`
}

const SETUP_STEPS = [
  { label: "Creating branch", icon: "⑂" },
  { label: "Setting up worktree", icon: "⬡" },
  { label: "Scaffolding workspace", icon: "⧉" },
  { label: "Linking dependencies", icon: "⇄" },
  { label: "Initializing environment", icon: "◈" },
]

const PARTICLE_COUNT = 10

type CreatingState = {
  repoId: string
  name: string
  branch: string
  repoName: string
}

function SetupOverlay({ creating }: { creating: CreatingState }) {
  const float = useRef(new Animated.Value(0)).current
  const ring1Scale = useRef(new Animated.Value(0.8)).current
  const ring1Opacity = useRef(new Animated.Value(0.5)).current
  const ring2Scale = useRef(new Animated.Value(0.8)).current
  const ring2Opacity = useRef(new Animated.Value(0.35)).current
  const ring3Scale = useRef(new Animated.Value(0.8)).current
  const ring3Opacity = useRef(new Animated.Value(0.2)).current
  const orbit = useRef(new Animated.Value(0)).current
  const orbit2 = useRef(new Animated.Value(0)).current
  const fadeIn = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  const particleAnims = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0))
  ).current

  const [visibleSteps, setVisibleSteps] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [typedTitle, setTypedTitle] = useState("")

  const particles = useMemo(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: `${(i * 41 + 17) % 100}%` as `${number}%`,
      y: `${(i * 59 + 11) % 100}%` as `${number}%`,
      size: 2 + (i % 3),
      duration: 2500 + (i % 4) * 1100,
      delay: (i % 8) * 350,
      baseOpacity: 0.1 + (i % 4) * 0.08,
      color: i % 3 === 0 ? "rgba(251,191,36,1)" : i % 3 === 1 ? "rgba(96,165,250,1)" : "rgba(167,139,250,1)",
    })),
  [])

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -8, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()

    const makeRingAnim = (
      scale: Animated.Value,
      opacity: Animated.Value,
      startOpacity: number,
      delay: number,
    ) => {
      const run = () => {
        scale.setValue(0.8)
        opacity.setValue(startOpacity)
        Animated.parallel([
          Animated.timing(scale, { toValue: 2.5, duration: 2500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 2500, useNativeDriver: true }),
        ]).start(() => run())
      }
      if (delay > 0) setTimeout(run, delay)
      else run()
    }
    makeRingAnim(ring1Scale, ring1Opacity, 0.5, 0)
    makeRingAnim(ring2Scale, ring2Opacity, 0.35, 800)
    makeRingAnim(ring3Scale, ring3Opacity, 0.2, 1600)

    Animated.loop(
      Animated.timing(orbit, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })
    ).start()
    Animated.loop(
      Animated.timing(orbit2, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true })
    ).start()

    particleAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(particles[i].delay),
          Animated.timing(anim, { toValue: 1, duration: particles[i].duration / 2, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: particles[i].duration / 2, useNativeDriver: true }),
        ])
      ).start()
    })
  }, [])

  // Typewriter effect
  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      if (i <= creating.name.length) {
        setTypedTitle(creating.name.slice(0, i))
        i++
      } else {
        clearInterval(timer)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [creating.name])

  // Step progression over ~3s
  useEffect(() => {
    const budget = 3000 * 0.9
    const stepTime = budget / SETUP_STEPS.length
    const timers: ReturnType<typeof setTimeout>[] = []
    SETUP_STEPS.forEach((_, i) => {
      const showAt = 300 + i * stepTime
      const doneAt = showAt + stepTime * 0.65
      timers.push(setTimeout(() => setVisibleSteps((v) => v + 1), showAt))
      if (i < SETUP_STEPS.length - 1) {
        timers.push(setTimeout(() => setCompletedSteps((v) => v + 1), doneAt))
      }
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  // Progress bar
  useEffect(() => {
    const prog = Math.min(((completedSteps + 0.5) / SETUP_STEPS.length) * 100, 95)
    Animated.timing(progressAnim, { toValue: prog, duration: 600, useNativeDriver: false }).start()
  }, [completedSteps])

  const orbitRotate = orbit.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  const orbit2Rotate = orbit2.interpolate({ inputRange: [0, 1], outputRange: ["120deg", "480deg"] })

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: fadeIn }]}>
      {/* Floating particles */}
      {particles.map((p, i) => (
        <Animated.View
          key={p.id}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            opacity: particleAnims[i].interpolate({
              inputRange: [0, 1],
              outputRange: [p.baseOpacity, Math.min(p.baseOpacity * 2.5, 0.6)],
            }),
          }}
        />
      ))}

      {/* Floating icon cluster */}
      <Animated.View style={{ transform: [{ translateY: float }] }}>
        {/* Expanding rings */}
        <Animated.View style={[styles.ring, { borderColor: "rgba(251,191,36,1)", transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]} />
        <Animated.View style={[styles.ring, { borderColor: "rgba(96,165,250,1)", transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
        <Animated.View style={[styles.ring, { borderColor: "rgba(167,139,250,1)", transform: [{ scale: ring3Scale }], opacity: ring3Opacity }]} />

        {/* Orbiting dot 1 */}
        <Animated.View style={[styles.orbitContainer, { transform: [{ rotate: orbitRotate }] }]}>
          <View style={styles.orbitDot1} />
        </Animated.View>

        {/* Orbiting dot 2 */}
        <Animated.View style={[styles.orbitContainer, { transform: [{ rotate: orbit2Rotate }] }]}>
          <View style={styles.orbitDot2} />
        </Animated.View>

        {/* Icon box */}
        <View style={[styles.iconBox, { backgroundColor: c.card }]}>
          <Text style={styles.hexIcon}>⬡</Text>
        </View>
      </Animated.View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={[styles.titleText, { color: c.fg }]}>
          {typedTitle}
          <Text style={styles.cursor}>|</Text>
        </Text>
        <Text style={[styles.branchText, { color: c.fgSub }]} numberOfLines={1}>
          {creating.branch}
        </Text>
      </View>

      {/* Terminal card */}
      <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}>
        {/* macOS traffic lights header */}
        <View style={[styles.cardHeader, { borderBottomColor: c.border }]}>
          <View style={styles.dot_red} />
          <View style={styles.dot_yellow} />
          <View style={styles.dot_green} />
          <Text style={[styles.repoLabel, { color: c.fgSub }]}>{creating.repoName}</Text>
        </View>

        {/* Step list */}
        <View style={styles.stepList}>
          {SETUP_STEPS.slice(0, visibleSteps).map((step, i) => {
            const isDone = i < completedSteps
            const isCurrent = i === visibleSteps - 1 && !isDone
            return (
              <View key={i} style={styles.stepRow}>
                <Text style={[styles.stepIcon, { color: c.fgSub }]}>{step.icon}</Text>
                <Text
                  style={[
                    styles.stepLabel,
                    isDone
                      ? { color: c.fgSub, opacity: 0.4 }
                      : isCurrent
                        ? { color: "#fbbf24" }
                        : { color: c.fg, opacity: 0.7 },
                  ]}
                >
                  {step.label}
                </Text>
                {isDone && <Text style={styles.checkmark}>✓</Text>}
                {isCurrent && <ActivityIndicator size="small" color="#fbbf24" />}
              </View>
            )
          })}
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressTrack, { backgroundColor: c.secondary }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "#1c1917",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  ring: {
    position: "absolute",
    left: 0, top: 0, right: 0, bottom: 0,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  orbitContainer: {
    position: "absolute",
    left: 32, top: 32,
    width: 0, height: 0,
  },
  orbitDot1: {
    position: "absolute",
    left: 36, top: -3,
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(251,191,36,0.7)",
  },
  orbitDot2: {
    position: "absolute",
    left: 28, top: -2,
    width: 4, height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(96,165,250,0.5)",
  },
  iconBox: {
    width: 64, height: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  hexIcon: {
    fontSize: 28,
    color: "#fbbf24",
  },
  titleContainer: {
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 24,
  },
  titleText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "monospace",
    letterSpacing: 0.2,
  },
  cursor: {
    color: "rgba(251,191,36,0.7)",
  },
  branchText: {
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 4,
    opacity: 0.6,
  },
  card: {
    width: 300,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
  },
  dot_red: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "rgba(248,113,113,0.5)",
  },
  dot_yellow: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "rgba(250,204,21,0.5)",
  },
  dot_green: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "rgba(74,222,128,0.5)",
  },
  repoLabel: {
    fontSize: 9,
    fontFamily: "monospace",
    marginLeft: 6,
    opacity: 0.4,
  },
  stepList: {
    padding: 12,
    gap: 6,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepIcon: {
    fontSize: 11,
    width: 16,
    opacity: 0.4,
  },
  stepLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "monospace",
  },
  checkmark: {
    color: "#34d399",
    fontSize: 11,
  },
  progressContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#fbbf24",
  },
})

export default function NewAgentScreen() {
  const router = useRouter()
  const modal = useModal()
  const queryClient = useQueryClient()
  const { data: repos = [], isLoading } = useRepos()
  const [creating, setCreating] = useState<CreatingState | null>(null)
  const [direct, setDirect] = useState(false)

  async function handleSelectRepo(repo: Repo) {
    if (creating) return
    const name = randomBeeName()
    const prefix = repo.branchPrefix ? repo.branchPrefix.replace(/\/$/, "") + "/" : "agent/"
    const branch = `${prefix}${name}`
    setCreating({ repoId: repo.id, name, branch, repoName: repo.name })
    try {
      const agent = await api.createAgent({
        repoId: repo.id,
        title: name,
        branch,
        model: "claude-sonnet-4-6",
        noWorktree: direct || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      router.replace(`/agent/${agent.id}`)
    } catch (e: any) {
      modal.showAlert("Error", e.message)
      setCreating(null)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", margin: 12, backgroundColor: c.secondary, borderRadius: 8, padding: 2 }}>
        <TouchableOpacity
          onPress={() => setDirect(false)}
          style={{ flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: "center", backgroundColor: !direct ? c.bg : "transparent" }}
        >
          <Text style={{ color: !direct ? c.fg : c.fgSub, fontSize: 13, fontWeight: "500" }}>Worktree</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setDirect(true)}
          style={{ flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: "center", backgroundColor: direct ? c.bg : "transparent" }}
        >
          <Text style={{ color: direct ? c.fg : c.fgSub, fontSize: 13, fontWeight: "500" }}>Direct</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 16, paddingBottom: 8 }}>
        Select Repository
      </Text>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.link} />
        </View>
      ) : (
        <FlashList
          data={repos}
          keyExtractor={(r) => r.id}
          renderItem={({ item: repo }) => (
            <TouchableOpacity
              onPress={() => handleSelectRepo(repo)}
              disabled={!!creating}
              style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.fg, fontSize: 15, fontWeight: "500" }}>{repo.name}</Text>
                <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace", marginTop: 2 }} numberOfLines={1}>{repo.path}</Text>
              </View>
              <Text style={{ color: c.fgSub, fontSize: 16 }}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>No repositories configured.{"\n"}Add one via the desktop app.</Text>
            </View>
          }
        />
      )}

      {creating && <SetupOverlay creating={creating} />}
    </View>
  )
}
