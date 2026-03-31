import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useRepos, api, type Repo } from "@hive/shared"
import { FlashList } from "@shopify/flash-list"
import { c } from "../theme"

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

  const canCreate = !!title.trim() && !!branch.trim()

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Step indicator */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {(["repo", "details"] as Step[]).map((s, i) => {
          const active = step === s || (s === "repo" && step === "details")
          return (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {i > 0 && <View style={{ width: 24, height: 1, backgroundColor: c.border }} />}
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: active ? c.primary : c.secondary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: active ? c.white : c.fgSub, fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
              </View>
              <Text style={{ color: step === s ? c.fg : c.fgSub, fontSize: 12 }}>
                {s === "repo" ? "Repository" : "Details"}
              </Text>
            </View>
          )
        })}
      </View>

      {step === "repo" ? (
        <View style={{ flex: 1 }}>
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
              estimatedItemSize={70}
              keyExtractor={(r) => r.id}
              renderItem={({ item: repo }) => (
                <TouchableOpacity
                  onPress={() => handleSelectRepo(repo)}
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
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <TouchableOpacity onPress={() => setStep("repo")} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Text style={{ color: c.link, fontSize: 13 }}>‹ {selectedRepo?.name}</Text>
          </TouchableOpacity>

          <View>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What will this agent work on?"
              placeholderTextColor={c.placeholder}
              style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.fg, fontSize: 14 }}
            />
          </View>

          <View>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Branch</Text>
            <TextInput
              value={branch}
              onChangeText={setBranch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="agent/my-feature"
              placeholderTextColor={c.placeholder}
              style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.fg, fontSize: 13, fontFamily: "monospace" }}
            />
          </View>

          <View>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Model</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {MODELS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setModel(m.id)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: model === m.id ? c.primaryDark : c.card,
                    borderWidth: 1,
                    borderColor: model === m.id ? c.primary : c.border,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: model === m.id ? c.white : c.fgSub, fontSize: 11, fontWeight: "600" }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Description (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description of the task"
              placeholderTextColor={c.placeholder}
              multiline
              numberOfLines={3}
              style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.fg, fontSize: 14, minHeight: 80, textAlignVertical: "top" }}
            />
          </View>

          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || creating}
            style={{
              backgroundColor: canCreate ? c.primary : c.secondary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            {creating ? (
              <ActivityIndicator color={c.white} />
            ) : (
              <Text style={{ color: canCreate ? c.white : c.fgSub, fontWeight: "600", fontSize: 15 }}>
                Create Agent
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}
