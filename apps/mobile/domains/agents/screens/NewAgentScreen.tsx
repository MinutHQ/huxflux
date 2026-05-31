import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { useRouter } from "expo-router"
import { useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useRepos, api, type Repo, queryKeys } from "@huxflux/shared"
import { FlashList } from "@shopify/flash-list"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { setSetupMessage } from "@/lib/setupMessage"
import { SetupOverlay, type CreatingState } from "../components/new-agent/SetupOverlay"
import { randomBeeName } from "../utils"

function RepoRow({ repo, disabled, onPress }: { repo: Repo; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fg, fontSize: 15, fontWeight: "500" }}>{repo.name}</Text>
        <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace", marginTop: 2 }} numberOfLines={1}>{repo.path}</Text>
      </View>
      <Text style={{ color: c.fgSub, fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  )
}

function ModeToggle({ direct, onChange }: { direct: boolean; onChange: (d: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", margin: 12, backgroundColor: c.secondary, borderRadius: 8, padding: 2 }}>
      <TouchableOpacity
        onPress={() => onChange(false)}
        style={{ flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: "center", backgroundColor: !direct ? c.bg : "transparent" }}
      >
        <Text style={{ color: !direct ? c.fg : c.fgSub, fontSize: 13, fontWeight: "500" }}>Worktree</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onChange(true)}
        style={{ flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: "center", backgroundColor: direct ? c.bg : "transparent" }}
      >
        <Text style={{ color: direct ? c.fg : c.fgSub, fontSize: 13, fontWeight: "500" }}>Direct</Text>
      </TouchableOpacity>
    </View>
  )
}

export function NewAgentScreen() {
  const router = useRouter()
  const modal = useModal()
  const queryClient = useQueryClient()
  const { data: repos = [], isLoading } = useRepos()
  const [creating, setCreating] = useState<CreatingState | null>(null)
  const [direct, setDirect] = useState(false)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)

  const handleQueueMessage = useCallback((msg: string) => {
    setQueuedMessage(msg)
    setSetupMessage(msg)
  }, [])

  async function handleSelectRepo(repo: Repo) {
    if (creating) return
    const name = randomBeeName()
    const prefix = repo.branchPrefix ? repo.branchPrefix.replace(/\/$/, "") + "/" : "agent/"
    const branch = `${prefix}${name}`
    setQueuedMessage(null)
    setSetupMessage(null)
    setCreating({ repoId: repo.id, name, branch, repoName: repo.name })
    try {
      // fire-and-forget; intentional: create chains into local setCreating + navigation, with bespoke error rollback
      // eslint-disable-next-line no-restricted-syntax
      const agent = await api.agents.create({
        repoId: repo.id,
        title: name,
        branch,
        model: "claude-sonnet-4-6",
        noWorktree: direct || undefined,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
      router.replace(`/agent/${agent.id}`)
    } catch (e: unknown) {
      modal.showAlert("Error", e instanceof Error ? e.message : String(e))
      setCreating(null)
      setQueuedMessage(null)
      setSetupMessage(null)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ModeToggle direct={direct} onChange={setDirect} />

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
            <RepoRow repo={repo} disabled={!!creating} onPress={() => handleSelectRepo(repo)} />
          )}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>No repositories configured.{"\n"}Add one via the desktop app.</Text>
            </View>
          }
        />
      )}

      {creating && <SetupOverlay creating={creating} onQueueMessage={handleQueueMessage} queuedMessage={queuedMessage} />}
    </View>
  )
}
