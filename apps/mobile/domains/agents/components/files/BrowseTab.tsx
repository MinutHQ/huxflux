import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { Ionicons } from "@expo/vector-icons"
import { useQueryClient } from "@tanstack/react-query"
import { api, fuzzyFilterPaths, groupSearchMatches, queryKeys, useAgentEvents, useHuxfluxQuery, type Agent } from "@huxflux/shared"
import { c } from "@/theme"
import { useDirectoryRows, type DirectoryRow } from "../../hooks/useDirectoryRows"

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

type ResultRow =
  | { kind: "file"; path: string; count?: number }
  | { kind: "hit"; path: string; line: number; preview: string }

/**
 * The whole worktree as a lazy tree (gitignored entries dimmed), with a
 * filter box: plain text fuzzy-matches file names, a leading `?` searches
 * file contents. Tapping a file (or a hit) opens it in the viewer.
 */
export function BrowseTab({ agent, onOpen }: { agent: Agent; onOpen: (path: string, line?: number) => void }) {
  const [filter, setFilter] = useState("")
  const tree = useDirectoryRows(agent.id)
  const isContent = filter.startsWith("?")
  const query = useDebounced(isContent ? filter.slice(1).trim() : filter.trim(), isContent ? 300 : 80)
  const changed = useMemo(() => new Set(agent.fileChanges.map((f) => f.path)), [agent.fileChanges])
  const queryClient = useQueryClient()

  // Worktree changed: reload folder listings, the name index and any open file.
  useAgentEvents(agent.id, (event) => {
    if (event.type !== "file:changed") return
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.directoryRoot(agent.id) })
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.filePaths(agent.id) })
    queryClient.invalidateQueries({ queryKey: ["file-read", agent.id] })
  })

  const { data: paths = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.filePaths(agent.id),
    queryFn: () => api.agents.filePaths(agent.id),
    enabled: !!filter && !isContent,
    staleTime: 30_000,
  })
  const { data: hits = [], isFetching } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileSearch(agent.id, query),
    queryFn: () => api.agents.searchFiles(agent.id, query),
    enabled: isContent && query.length > 0,
    staleTime: 10_000,
  })

  const results = useMemo<ResultRow[]>(() => {
    if (!filter) return []
    if (!isContent) return fuzzyFilterPaths(paths, query, 200).map((m) => ({ kind: "file", path: m.path }))
    return groupSearchMatches(hits).flatMap((g) => [
      { kind: "file" as const, path: g.path, count: g.matches.length },
      ...g.matches.map((m) => ({ kind: "hit" as const, path: m.path, line: m.line, preview: m.preview })),
    ])
  }, [filter, isContent, paths, hits, query])

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 10, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
        <Ionicons name="search" size={14} color={c.fgSub} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter, or ? to search in files"
          placeholderTextColor={c.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: c.fg, fontSize: 13, paddingVertical: 8 }}
        />
        {filter ? (
          <TouchableOpacity onPress={() => setFilter("")} hitSlop={8}><Ionicons name="close-circle" size={16} color={c.fgSub} /></TouchableOpacity>
        ) : null}
      </View>
      {filter ? (
        <FlashList
          data={results}
          keyExtractor={(r) => (r.kind === "file" ? `f:${r.path}` : `h:${r.path}:${r.line}`)}
          getItemType={(r) => r.kind}
          renderItem={({ item }) => item.kind === "file" ? (
            <TouchableOpacity onPress={() => onOpen(item.path)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9 }}>
              <Ionicons name="document-outline" size={13} color={c.fgSub} />
              <Text style={{ color: c.fg, fontSize: 13, fontFamily: "monospace", flex: 1 }} numberOfLines={1}>{item.path}</Text>
              {item.count ? <Text style={{ color: c.fgSub, fontSize: 11 }}>{item.count}</Text> : null}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => onOpen(item.path, item.line)} style={{ flexDirection: "row", gap: 8, paddingLeft: 36, paddingRight: 14, paddingVertical: 5 }}>
              <Text style={{ color: c.fgSub, fontSize: 10, fontFamily: "monospace", width: 32, textAlign: "right" }}>{item.line}</Text>
              <Text style={{ color: c.fgBright, fontSize: 11, fontFamily: "monospace", flex: 1 }} numberOfLines={1}>{item.preview}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: c.fgSub, fontSize: 13, padding: 16 }}>
              {isContent ? (query ? (isFetching ? "Searching..." : "No matches") : "Type to search file contents") : "No matching files"}
            </Text>
          }
        />
      ) : tree.rootError ? (
        <Text style={{ color: c.fgSub, fontSize: 13, padding: 16 }}>
          Could not list files ({tree.rootError.message}). If this server runs an older Huxflux version, update it to browse files here.
        </Text>
      ) : (
        <FlashList
          data={tree.rows}
          keyExtractor={(r) => (r.kind === "entry" ? r.entry.path : `loading:${r.path}`)}
          getItemType={(r) => r.kind}
          renderItem={({ item }) => <TreeLine row={item} changed={changed} onToggle={tree.toggle} onOpen={onOpen} />}
        />
      )}
    </View>
  )
}

function TreeLine({ row, changed, onToggle, onOpen }: { row: DirectoryRow; changed: Set<string>; onToggle: (p: string) => void; onOpen: (p: string) => void }) {
  if (row.kind === "loading") {
    return <View style={{ paddingLeft: 30 + row.depth * 14, paddingVertical: 8 }}><ActivityIndicator size="small" color={c.fgSub} /></View>
  }
  const { entry } = row
  const isDir = entry.type === "directory"
  const color = entry.ignored ? c.placeholder : changed.has(entry.path) ? c.warning : isDir ? c.fg : c.fgBright
  return (
    <TouchableOpacity
      onPress={() => (isDir ? onToggle(entry.path) : onOpen(entry.path))}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 12 + row.depth * 14, paddingRight: 14, paddingVertical: 8 }}
    >
      <Ionicons name={isDir ? (row.expanded ? "chevron-down" : "chevron-forward") : "document-outline"} size={13} color={entry.ignored ? c.placeholder : c.fgSub} />
      <Text style={{ color, fontSize: 13, fontFamily: "monospace", flex: 1 }} numberOfLines={1}>{entry.name}</Text>
    </TouchableOpacity>
  )
}
