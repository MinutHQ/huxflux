import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from "react-native"
import { useAgent, api, type FileChange, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import { useState, useCallback } from "react"
import { c } from "@/theme"
import { InlineFileDiff } from "../components/files/InlineFileDiff"
import { TreeRow, type TreeNode } from "../components/files/TreeRow"

export function AgentFilesScreen({ agentId }: { agentId: string }) {
  const { data: agent, isLoading } = useAgent(agentId ?? null)
  const [tab, setTab] = useState<"changes" | "tree">("changes")
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const { data: tree, isLoading: treeLoading } = useHuxfluxQuery<TreeNode[]>({
    queryKey: queryKeys.agents.fileTree(agentId),
    queryFn: () => api.agents.fileTree(agentId),
    enabled: !!agentId && tab === "tree",
    staleTime: 30_000,
  })

  const refreshFiles = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.agents.refreshFiles(agentId),
    invalidate: () => queryKeys.agents.detail(agentId),
  })

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const expandAll = useCallback((files: FileChange[]) => {
    setExpandedFiles(new Set(files.map((f) => f.path)))
  }, [])

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
  const allExpanded = files.length > 0 && files.every((f) => expandedFiles.has(f.path))

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
                onPress={() => refreshFiles.mutate()}
                style={{ marginLeft: 8, alignSelf: "center" }}
              >
                <Text style={{ color: c.link, fontSize: 12 }}>Refresh</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {tab === "changes" && files.length > 0 && (
          <TouchableOpacity
            onPress={() => allExpanded ? setExpandedFiles(new Set()) : expandAll(files)}
            style={{ paddingHorizontal: 16, paddingBottom: 8, alignSelf: "flex-start" }}
          >
            <Text style={{ color: c.link, fontSize: 12 }}>
              {allExpanded ? "Collapse all" : "Expand all"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {tab === "changes" ? (
        <FlatList
          data={files}
          keyExtractor={(f) => f.path}
          renderItem={({ item }) => (
            <InlineFileDiff
              file={item}
              agentId={agentId}
              expanded={expandedFiles.has(item.path)}
              onToggle={() => toggleFile(item.path)}
            />
          )}
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
          renderItem={({ item }) => <TreeRow node={item} depth={0} agentId={agentId} />}
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
