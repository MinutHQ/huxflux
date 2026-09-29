import { View, Text, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { useRepos } from "@huxflux/shared"
import { c } from "@/theme"
import { SectionLabel } from "./SettingsRow"
import { useAddRepoMenu } from "../hooks/useAddRepoMenu"

/** Registered repositories on the active server; tap one for its settings. */
export function ReposSection() {
  const router = useRouter()
  const openAddRepo = useAddRepoMenu()
  const { data: repos = [] } = useRepos()

  return (
    <View>
      <SectionLabel label="Repositories" />
      <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden" }}>
        {repos.map((repo) => (
          <TouchableOpacity
            key={repo.id}
            onPress={() => router.push(`/repo/${repo.id}`)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}
          >
            <Ionicons name={repo.type === "folder" ? "folder-outline" : "git-branch-outline"} size={16} color={c.fgSub} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{repo.name}</Text>
              <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", marginTop: 2 }} numberOfLines={1}>{repo.path}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={c.fgSub} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={openAddRepo}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <Ionicons name="add-circle-outline" size={16} color={c.link} />
          <Text style={{ color: c.link, fontSize: 14, fontWeight: "500" }}>Add workspace…</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
