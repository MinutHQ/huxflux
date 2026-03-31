import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { useAgent, api, type FileChange } from "@hive/shared"
import { useQueryClient } from "@tanstack/react-query"
import { c } from "../../../theme"

function FileRow({ file, agentId }: { file: FileChange; agentId: string }) {
  const router = useRouter()
  const name = file.path.split("/").pop() ?? file.path
  const dir = file.path.slice(0, file.path.length - name.length - 1)

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: "/agent/[id]/diff", params: { id: agentId, path: file.path } })}
      style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {dir ? (
          <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", marginBottom: 1 }}>{dir}/</Text>
        ) : null}
        <Text style={{ color: c.fg, fontSize: 13, fontFamily: "monospace" }} numberOfLines={1}>{name}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {file.additions > 0 && (
          <Text style={{ color: c.success, fontSize: 12, fontWeight: "600" }}>+{file.additions}</Text>
        )}
        {file.deletions > 0 && (
          <Text style={{ color: c.error, fontSize: 12, fontWeight: "600" }}>-{file.deletions}</Text>
        )}
        <Text style={{ color: c.fgSub, fontSize: 14 }}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function FilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: agent, isLoading } = useAgent(id ?? null)

  if (isLoading || !agent) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

  const files = agent.fileChanges
  const totalAdd = files.reduce((s, f) => s + f.additions, 0)
  const totalDel = files.reduce((s, f) => s + f.deletions, 0)

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ color: c.fgSub, fontSize: 12 }}>{files.length} file{files.length !== 1 ? "s" : ""}</Text>
        <Text style={{ color: c.success, fontSize: 12, fontWeight: "600" }}>+{totalAdd}</Text>
        <Text style={{ color: c.error, fontSize: 12, fontWeight: "600" }}>-{totalDel}</Text>
        <TouchableOpacity
          onPress={async () => {
            await api.refreshFiles(id!)
            queryClient.invalidateQueries({ queryKey: ["agent", id] })
          }}
          style={{ marginLeft: "auto" }}
        >
          <Text style={{ color: c.link, fontSize: 12 }}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <FlashList
        data={files}
        estimatedItemSize={60}
        keyExtractor={(f) => f.path}
        renderItem={({ item }) => <FileRow file={item} agentId={id!} />}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: c.fgSub, fontSize: 14 }}>No file changes yet</Text>
          </View>
        }
      />
    </View>
  )
}
