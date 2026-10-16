import { useMemo, useRef, useState } from "react"
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native"
import { FlashList, type FlashListRef } from "@shopify/flash-list"
import { Ionicons } from "@expo/vector-icons"
import {
  api, orderChangedFiles, parseUnifiedDiff, queryKeys, useHuxfluxQuery,
  type Agent, type AgentFileDiff, type DiffBase, type DiffLine,
} from "@huxflux/shared"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { DiffLineRow } from "../DiffLineRow"

type Row =
  | { kind: "header"; file: AgentFileDiff; collapsed: boolean }
  | { kind: "line"; path: string; line: DiffLine; key: string }

interface DiffTabProps {
  agent: Agent
  onComment: (path: string, line: number) => void
  onOpenFile: (path: string) => void
}

/**
 * Every changed file stacked in one list with collapsible headers, like the
 * web Diff pane. One batched request; a jump list scrolls to a file; long
 * press a new-side line to comment on it.
 */
export function DiffTab({ agent, onComment, onOpenFile }: DiffTabProps) {
  const modal = useModal()
  const listRef = useRef<FlashListRef<Row>>(null)
  const [base, setBase] = useState<DiffBase>("branch")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { data: diffs, isLoading, refetch, isRefetching } = useHuxfluxQuery({
    queryKey: queryKeys.agents.allDiffs(agent.id, base),
    queryFn: () => api.agents.allDiffs(agent.id, base),
    staleTime: 30_000,
    // The watcher sends file:changed after every worktree refresh.
    on: { "file:changed": (event, h) => { if (event.agentId === agent.id) h.invalidate() } },
  })

  const ordered = useMemo(() => orderChangedFiles(diffs ?? []), [diffs])
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const file of ordered) {
      const isCollapsed = collapsed.has(file.path)
      out.push({ kind: "header", file, collapsed: isCollapsed })
      if (isCollapsed) continue
      parseUnifiedDiff(file.diff).forEach((line, i) => out.push({ kind: "line", path: file.path, line, key: `${file.path}:${i}` }))
    }
    return out
  }, [ordered, collapsed])

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function jumpTo(path: string) {
    setCollapsed((prev) => { const next = new Set(prev); next.delete(path); return next })
    const index = rows.findIndex((r) => r.kind === "header" && r.file.path === path)
    if (index >= 0) setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true }), 50)
  }

  function showJumpList() {
    modal.showActionSheet("Jump to file", ordered.map((f) => ({
      label: `${f.path}  +${f.additions} -${f.deletions}`,
      onPress: () => jumpTo(f.path),
    })))
  }

  const totals = ordered.reduce((t, f) => ({ add: t.add + f.additions, del: t.del + f.deletions }), { add: 0, del: 0 })

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {(["branch", "uncommitted"] as const).map((b) => (
          <TouchableOpacity key={b} onPress={() => setBase(b)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: base === b ? c.secondary : "transparent" }}>
            <Text style={{ color: base === b ? c.fg : c.fgSub, fontSize: 12, fontWeight: base === b ? "600" : "400" }}>
              {b === "branch" ? "Branch" : "Uncommitted"}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <Text style={{ color: c.success, fontSize: 12, fontWeight: "600" }}>+{totals.add}</Text>
        <Text style={{ color: c.error, fontSize: 12, fontWeight: "600" }}>-{totals.del}</Text>
        <TouchableOpacity onPress={showJumpList} disabled={ordered.length === 0} hitSlop={8} style={{ marginLeft: 8 }}>
          <Ionicons name="list" size={18} color={ordered.length ? c.fg : c.fgSub} />
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={c.link} /></View>
      ) : (
        <FlashList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => (r.kind === "header" ? `h:${r.file.path}` : r.key)}
          getItemType={(r) => r.kind}
          onRefresh={refetch}
          refreshing={isRefetching}
          renderItem={({ item }) => item.kind === "header" ? (
            <FileHeader file={item.file} collapsed={item.collapsed} onToggle={() => toggle(item.file.path)} onOpen={() => onOpenFile(item.file.path)} />
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              delayLongPress={350}
              onLongPress={() => { if (item.line.type !== "del" && item.line.type !== "hunk" && item.line.lineNo) onComment(item.path, item.line.lineNo) }}
            >
              <DiffLineRow line={item.line} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 14 }}>{base === "uncommitted" ? "No uncommitted changes" : "No file changes yet"}</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

function FileHeader({ file, collapsed, onToggle, onOpen }: { file: AgentFileDiff; collapsed: boolean; onToggle: () => void; onOpen: () => void }) {
  const name = file.path.split("/").pop() ?? file.path
  const dir = file.path.slice(0, Math.max(0, file.path.length - name.length - 1))
  return (
    <TouchableOpacity onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: c.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border }}>
      <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={13} color={c.fgSub} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.fg, fontSize: 12, fontFamily: "monospace", fontWeight: "600" }} numberOfLines={1}>{name}</Text>
        {dir ? <Text style={{ color: c.fgSub, fontSize: 10, fontFamily: "monospace" }} numberOfLines={1}>{dir}</Text> : null}
      </View>
      <Text style={{ color: c.success, fontSize: 11, fontWeight: "600" }}>+{file.additions}</Text>
      <Text style={{ color: c.error, fontSize: 11, fontWeight: "600" }}>-{file.deletions}</Text>
      <TouchableOpacity onPress={onOpen} hitSlop={8} style={{ marginLeft: 4 }}>
        <Ionicons name="document-text-outline" size={16} color={c.fgSub} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}
