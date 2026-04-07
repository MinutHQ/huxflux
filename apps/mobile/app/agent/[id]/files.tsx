import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, ScrollView } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { useAgent, api, parseUnifiedDiff, tokenize, type FileChange, type DiffLine } from "@huxflux/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, useCallback } from "react"
import { c } from "../../../theme"
import { Ionicons } from "@expo/vector-icons"

// ── Syntax token colors ───────────────────────────────────────────────────────

const TOKEN_COLOR: Record<string, string> = {
  comment:     c.fgSub,
  string:      c.warning,
  template:    "#7dd3fc",
  keyword:     "#a78bfa",
  type:        "#7dd3fc",
  constructor: "#2dd4bf",
  number:      "#fb923c",
  punctuation: c.fgSub,
  identifier:  c.fgBright,
  whitespace:  "transparent",
  other:       c.fgSub,
}

// ── Diff line row ─────────────────────────────────────────────────────────────

function DiffLineRow({ line }: { line: DiffLine }) {
  const isAdd  = line.type === "add"
  const isDel  = line.type === "del"
  const isHunk = line.type === "hunk"

  if (isHunk) {
    return (
      <View style={{ backgroundColor: c.card, paddingHorizontal: 12, paddingVertical: 3 }}>
        <Text style={{ color: c.link, fontSize: 11, fontFamily: "monospace", opacity: 0.7 }}>{line.text}</Text>
      </View>
    )
  }

  const bgColor   = isAdd ? c.addBg : isDel ? c.delBg : "transparent"
  const signColor = isAdd ? c.success : isDel ? c.error : "transparent"
  const sign      = isAdd ? "+" : isDel ? "−" : " "
  const tokens    = tokenize(line.text)

  return (
    <View style={{ flexDirection: "row", backgroundColor: bgColor, minHeight: 22 }}>
      <Text style={{
        color: isAdd ? c.success : isDel ? c.error : c.placeholder,
        fontSize: 10, fontFamily: "monospace", width: 36, textAlign: "right",
        paddingRight: 6, paddingTop: 3, flexShrink: 0, opacity: 0.7,
      }}>
        {line.lineNo ?? ""}
      </Text>
      <Text style={{ color: signColor, fontSize: 12, fontFamily: "monospace", width: 14, paddingTop: 3, flexShrink: 0 }}>
        {sign}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 20, paddingTop: 2, paddingRight: 16 }}>
          {tokens.map((tok, i) => (
            <Text key={i} style={{ color: TOKEN_COLOR[tok.cls] ?? c.fgBright }}>{tok.text}</Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  )
}

// ── Inline file diff ──────────────────────────────────────────────────────────

function InlineFileDiff({ file, agentId, expanded, onToggle }: {
  file: FileChange
  agentId: string
  expanded: boolean
  onToggle: () => void
}) {
  const name = file.path.split("/").pop() ?? file.path
  const dir  = file.path.slice(0, file.path.length - name.length - 1)

  const { data: rawDiff, isLoading } = useQuery({
    queryKey: ["diff", agentId, file.path],
    queryFn: () => api.getDiff(agentId, file.path),
    enabled: expanded,
    staleTime: 10_000,
  })

  const lines = rawDiff ? parseUnifiedDiff(rawDiff) : []

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
      {/* File header */}
      <TouchableOpacity
        onPress={onToggle}
        style={{
          paddingHorizontal: 14, paddingVertical: 10,
          flexDirection: "row", alignItems: "center", gap: 10,
          backgroundColor: c.card,
        }}
      >
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={13}
          color={c.fgSub}
          style={{ flexShrink: 0 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          {dir ? (
            <Text style={{ color: c.fgSub, fontSize: 10, fontFamily: "monospace" }} numberOfLines={1}>
              {dir}/
            </Text>
          ) : null}
          <Text style={{ color: c.fg, fontSize: 12, fontFamily: "monospace", fontWeight: "600" }} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {file.additions > 0 && (
            <Text style={{ color: c.success, fontSize: 11, fontWeight: "600" }}>+{file.additions}</Text>
          )}
          {file.deletions > 0 && (
            <Text style={{ color: c.error, fontSize: 11, fontWeight: "600" }}>-{file.deletions}</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Diff lines */}
      {expanded && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
          {isLoading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={c.link} size="small" />
            </View>
          ) : lines.length === 0 ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 12 }}>No diff available</Text>
            </View>
          ) : (
            lines.map((line, i) => <DiffLineRow key={i} line={line} />)
          )}
        </View>
      )}
    </View>
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
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: ["file-tree", id],
    queryFn: () => api.getFileTree(id!),
    enabled: !!id && tab === "tree",
    staleTime: 30_000,
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
              agentId={id!}
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
