import { useState } from "react"
import {
  View, Text, TouchableOpacity,
  ActivityIndicator, Alert,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useRepos, api, type Repo } from "@hive/shared"
import { FlashList } from "@shopify/flash-list"
import { c } from "../theme"

const BEE_ADJECTIVES = [
  "golden", "amber", "clover", "lavender", "sage", "thyme", "meadow",
  "misty", "swift", "bright", "busy", "wild", "pollen", "honey", "wax",
  "violet", "royal", "fuzzy", "striped", "sunlit",
]
const BEE_NOUNS = [
  "scout", "forager", "guard", "worker", "drone", "nurse", "harvester",
  "wanderer", "pilgrim", "ranger", "keeper", "seeker", "drifter", "carrier",
]

function randomBeeName(): string {
  const adj = BEE_ADJECTIVES[Math.floor(Math.random() * BEE_ADJECTIVES.length)]
  const noun = BEE_NOUNS[Math.floor(Math.random() * BEE_NOUNS.length)]
  return `${adj}-${noun}`
}

export default function NewAgentScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: repos = [], isLoading } = useRepos()
  const [creating, setCreating] = useState<string | null>(null)

  async function handleSelectRepo(repo: Repo) {
    if (creating) return
    setCreating(repo.id)
    try {
      const name = randomBeeName()
      const prefix = repo.branchPrefix ? repo.branchPrefix.replace(/\/$/, "") + "/" : "agent/"
      const branch = `${prefix}${name}`
      const agent = await api.createAgent({
        repoId: repo.id,
        title: name,
        branch,
        model: "claude-sonnet-4-6",
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      router.replace(`/agent/${agent.id}`)
    } catch (e: any) {
      Alert.alert("Error", e.message)
      setCreating(null)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
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
          renderItem={({ item: repo }) => {
            const isCreating = creating === repo.id
            return (
              <TouchableOpacity
                onPress={() => handleSelectRepo(repo)}
                disabled={!!creating}
                style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.fg, fontSize: 15, fontWeight: "500" }}>{repo.name}</Text>
                  <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace", marginTop: 2 }} numberOfLines={1}>{repo.path}</Text>
                </View>
                {isCreating ? (
                  <ActivityIndicator color={c.link} size="small" />
                ) : (
                  <Text style={{ color: c.fgSub, fontSize: 16 }}>›</Text>
                )}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>No repositories configured.{"\n"}Add one via the desktop app.</Text>
            </View>
          }
        />
      )}
    </View>
  )
}
