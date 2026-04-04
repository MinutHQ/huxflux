import { useState, useEffect } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert } from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@hive/shared"
import { c } from "../theme"
import { Ionicons } from "@expo/vector-icons"

interface FoundRepo { name: string; path: string }

export default function AddRepoScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [discovered, setDiscovered] = useState<FoundRepo[]>([])
  const [loadingDiscovered, setLoadingDiscovered] = useState(true)
  const [selected, setSelected] = useState<FoundRepo | null>(null)
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [branchFrom, setBranchFrom] = useState("origin/main")
  const [loadingBranch, setLoadingBranch] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    api.findRepos().then((r) => setDiscovered(r)).catch(() => {}).finally(() => setLoadingDiscovered(false))
  }, [])

  async function handleSelect(repo: FoundRepo) {
    setSelected(repo)
    setName(repo.name)
    setPath(repo.path)
    setLoadingBranch(true)
    try {
      const res = await api.getDefaultBranch(repo.path)
      setBranchFrom(res.branch)
    } catch { /* keep default */ }
    finally { setLoadingBranch(false) }
  }

  async function handleSubmit() {
    const repoPath = selected?.path ?? path.trim()
    const repoName = name.trim() || repoPath.split("/").pop() ?? "repo"
    if (!repoPath || submitting) return
    setSubmitting(true)
    try {
      await api.createRepo({ name: repoName, path: repoPath, branchFrom, remote: "origin" } as any)
      queryClient.invalidateQueries({ queryKey: ["repos"] })
      router.back()
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Failed to add repo")
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = search.trim()
    ? discovered.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.path.toLowerCase().includes(search.toLowerCase()))
    : discovered

  const canSubmit = !!(selected?.path ?? path.trim()) && !submitting

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Search / discover */}
      {!selected && (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
            <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
              <Ionicons name="search-outline" size={15} color={c.placeholder} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search repos…"
                placeholderTextColor={c.placeholder}
                style={{ flex: 1, color: c.fg, fontSize: 14, paddingVertical: 10 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {loadingDiscovered ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={c.accent} />
              <Text style={{ color: c.fgSub, fontSize: 13, marginTop: 10 }}>Discovering repos…</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(r) => r.path}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelect(item)}
                  style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <Ionicons name="folder-outline" size={18} color={c.fgSub} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{item.name}</Text>
                    <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", marginTop: 2 }} numberOfLines={1}>{item.path}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={c.fgSub} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 32, alignItems: "center" }}>
                  <Text style={{ color: c.fgSub, fontSize: 14 }}>No repos found</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 32 }}
            />
          )}
        </>
      )}

      {/* Confirm details */}
      {selected && (
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
          <TouchableOpacity
            onPress={() => { setSelected(null); setName(""); setPath(""); setBranchFrom("origin/main") }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Ionicons name="arrow-back" size={16} color={c.fgSub} />
            <Text style={{ color: c.fgSub, fontSize: 13 }}>Change repo</Text>
          </TouchableOpacity>

          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace" }} numberOfLines={2}>{selected.path}</Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: c.fgSub, fontSize: 12, fontWeight: "600" }}>Name</Text>
            <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10 }}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Repo name"
                placeholderTextColor={c.placeholder}
                style={{ color: c.fg, fontSize: 14, padding: 12 }}
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: c.fgSub, fontSize: 12, fontWeight: "600" }}>Branch from</Text>
              {loadingBranch && <ActivityIndicator size="small" color={c.fgSub} />}
            </View>
            <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10 }}>
              <TextInput
                value={branchFrom}
                onChangeText={setBranchFrom}
                placeholder="origin/main"
                placeholderTextColor={c.placeholder}
                style={{ color: c.fg, fontSize: 14, padding: 12, fontFamily: "monospace" }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={{ backgroundColor: canSubmit ? c.accent : c.secondary, borderRadius: 10, paddingVertical: 14, alignItems: "center" }}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: canSubmit ? "#fff" : c.fgSub, fontSize: 15, fontWeight: "600" }}>Add repo</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
