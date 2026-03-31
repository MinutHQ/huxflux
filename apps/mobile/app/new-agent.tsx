import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useRepos, api, type Repo } from "@hive/shared"
import { FlashList } from "@shopify/flash-list"

type Step = "repo" | "details"

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
]

export default function NewAgentScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: repos = [], isLoading } = useRepos()

  const [step, setStep] = useState<Step>("repo")
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [title, setTitle] = useState("")
  const [branch, setBranch] = useState("")
  const [model, setModel] = useState(MODELS[0].id)
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)

  function handleSelectRepo(repo: Repo) {
    setSelectedRepo(repo)
    const prefix = repo.branchPrefix ? repo.branchPrefix.replace(/\/$/, "") + "/" : "agent/"
    setBranch(prefix)
    setStep("details")
  }

  async function handleCreate() {
    if (!title.trim() || !branch.trim() || !selectedRepo) return
    setCreating(true)
    try {
      const agent = await api.createAgent({
        repoId: selectedRepo.id,
        title: title.trim(),
        branch: branch.trim(),
        model,
        description: description.trim() || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      router.replace(`/agent/${agent.id}`)
    } catch (e: any) {
      Alert.alert("Error", e.message)
      setCreating(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Step indicator */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: "#1f1f1f" }}>
        {(["repo", "details"] as Step[]).map((s, i) => (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {i > 0 && <View style={{ width: 24, height: 1, backgroundColor: "#1f1f1f" }} />}
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: step === s || (s === "repo" && step === "details") ? "#3b82f6" : "#1f1f1f", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: step === s || (s === "repo" && step === "details") ? "#fff" : "#71717a", fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
            </View>
            <Text style={{ color: step === s ? "#fafafa" : "#71717a", fontSize: 12 }}>
              {s === "repo" ? "Repository" : "Details"}
            </Text>
          </View>
        ))}
      </View>

      {step === "repo" ? (
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#71717a", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
            Select Repository
          </Text>
          {isLoading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color="#60a5fa" />
            </View>
          ) : (
            <FlashList
              data={repos}
              estimatedItemSize={70}
              keyExtractor={(r) => r.id}
              renderItem={({ item: repo }) => (
                <TouchableOpacity
                  onPress={() => handleSelectRepo(repo)}
                  style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1f1f1f", flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fafafa", fontSize: 15, fontWeight: "500" }}>{repo.name}</Text>
                    <Text style={{ color: "#71717a", fontSize: 12, fontFamily: "monospace", marginTop: 2 }} numberOfLines={1}>{repo.path}</Text>
                  </View>
                  <Text style={{ color: "#71717a", fontSize: 16 }}>›</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 32, alignItems: "center" }}>
                  <Text style={{ color: "#71717a", fontSize: 14, textAlign: "center" }}>No repositories configured.{"\n"}Add one via the desktop app.</Text>
                </View>
              }
            />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {/* Back + repo name */}
          <TouchableOpacity onPress={() => setStep("repo")} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Text style={{ color: "#60a5fa", fontSize: 13 }}>‹ {selectedRepo?.name}</Text>
          </TouchableOpacity>

          <View>
            <Text style={{ color: "#71717a", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What will this agent work on?"
              placeholderTextColor="#3f3f46"
              style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#1f1f1f", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#fafafa", fontSize: 14 }}
            />
          </View>

          <View>
            <Text style={{ color: "#71717a", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Branch</Text>
            <TextInput
              value={branch}
              onChangeText={setBranch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="agent/my-feature"
              placeholderTextColor="#3f3f46"
              style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#1f1f1f", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#fafafa", fontSize: 13, fontFamily: "monospace" }}
            />
          </View>

          <View>
            <Text style={{ color: "#71717a", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Model</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {MODELS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setModel(m.id)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: model === m.id ? "#1d4ed8" : "#111111",
                    borderWidth: 1,
                    borderColor: model === m.id ? "#3b82f6" : "#1f1f1f",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: model === m.id ? "#fff" : "#71717a", fontSize: 11, fontWeight: "600" }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={{ color: "#71717a", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Description (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description of the task"
              placeholderTextColor="#3f3f46"
              multiline
              numberOfLines={3}
              style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#1f1f1f", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#fafafa", fontSize: 14, minHeight: 80, textAlignVertical: "top" }}
            />
          </View>

          <TouchableOpacity
            onPress={handleCreate}
            disabled={!title.trim() || !branch.trim() || creating}
            style={{
              backgroundColor: title.trim() && branch.trim() ? "#3b82f6" : "#1f1f1f",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: title.trim() && branch.trim() ? "#fff" : "#71717a", fontWeight: "600", fontSize: 15 }}>
                Create Agent
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}
