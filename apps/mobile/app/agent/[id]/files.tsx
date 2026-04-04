import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { useAgent, api, type FileChange } from "@huxflux/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, useCallback } from "react"
import { c } from "../../../theme"

// ── Changes tab ──────────────────────────────────────────────────────────────

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

// ── Tree tab ─────────────────────────────────────────────────────────────────

type TreeNode = { name: string; path: string; type: "file" | "directory"; children?: TreeNode[] }

function TreeRow({ node, depth, agentId }: { node: TreeNode; depth: number; agentId: string }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const isDir = node.type === "directory"

  return (
    <View>
      <TouchableOpacity
        onPress={() => {
          if (isDir) {
            setExpanded((v) => !v)
          } else {
            router.push({ pathname: "/agent/[id]/file-content", params: { id: agentId, path: node.path } })
          }
        }}
        style={{
          paddingLeft: 16 + depth * 16, paddingRight: 16, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: c.border,
          flexDirection: "row", alignItems: "center", gap: 8,
        }}
      >
        <Text style={{ color: c.fgSub, fontSize: 12 }}>
          {isDir ? (expanded ? "▾" : "▸") : " "}
        </Text>
        <Text style={{ color: isDir ? c.fg : c.fgBright, fontSize: 13, fontFamily: "monospace", flex: 1 }} numberOfLines={1}>
          {node.name}{isDir ? "/" : ""}
        </Text>
        {!isDir && <Text style={{ color: c.fgSub, fontSize: 14 }}>›</Text>}
      </TouchableOpacity>
      {isDir && expanded && node.children?.map((child) => (
        <TreeRow key={child.path} node={child} depth={depth + 1} agentId={agentId} />
      ))}
    </View>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function FilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: agent, isLoading } = useAgent(id ?? null)
  const [tab, setTab] = useState<"changes" | "tree">("changes")

  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: ["file-tree", id],
    queryFn: () => api.getFileTree(id!),
    enabled: !!id && tab === "tree",
    staleTime: 30_000,
  })

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
      {/* Tab toggle + summary */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 4 }}>
          {(["changes", "tree"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
                backgroundColor: tab === t ? c.secondary : "transparent",
              }}
            >
              <Text style={{ color: tab === t ? c.fg : c.fgSub, fontSize: 12, fontWeight: tab === t ? "600" : "400" }}>
                {t === "changes" ? "Changes" : "All Files"}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          {tab === "changes" && (
            <>
              <Text style={{ color: c.fgSub, fontSize: 12, alignSelf: "center" }}>{files.length} file{files.length !== 1 ? "s" : ""}</Text>
              <Text style={{ color: c.success, fontSize: 12, fontWeight: "600", alignSelf: "center", marginLeft: 8 }}>+{totalAdd}</Text>
              <Text style={{ color: c.error, fontSize: 12, fontWeight: "600", alignSelf: "center", marginLeft: 4 }}>-{totalDel}</Text>
              <TouchableOpacity
                onPress={async () => {
                  await api.refreshFiles(id!)
                  queryClient.invalidateQueries({ queryKey: ["agent", id] })
                }}
                style={{ marginLeft: 8, alignSelf: "center" }}
              >
                <Text style={{ color: c.link, fontSize: 12 }}>Refresh</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Content */}
      {tab === "changes" ? (
        <FlashList
          data={files}
          keyExtractor={(f) => f.path}
          renderItem={({ item }) => <FileRow file={item} agentId={id!} />}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 14 }}>No file changes yet</Text>
            </View>
          }
        />
      ) : treeLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.link} />
        </View>
      ) : (
        <FlatList
          data={tree ?? []}
          keyExtractor={(n) => n.path}
          renderItem={({ item }) => <TreeRow node={item} depth={0} agentId={id!} />}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 14 }}>No files found</Text>
            </View>
          }
        />
      )}
    </View>
  )
}
