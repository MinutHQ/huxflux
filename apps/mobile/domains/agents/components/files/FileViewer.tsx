import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native"
import { FlashList, type FlashListRef } from "@shopify/flash-list"
import { Ionicons } from "@expo/vector-icons"
import { api, queryKeys, tokenize, useHuxfluxQuery } from "@huxflux/shared"
import { c } from "@/theme"
import { TOKEN_COLOR } from "../DiffLineRow"
import { canSaveToPhone, useFileDownload } from "../../hooks/useFileDownload"

interface FileViewerProps {
  agentId: string
  path: string
  /** 1-based line to scroll to (from a search hit). */
  line?: number
  onBack: () => void
  onComment: (path: string, line: number) => void
}

/** Read-only file view inside the Files tab: line numbers, light highlighting, binary fallback, long-press to comment. */
export function FileViewer({ agentId, path, line, onBack, onComment }: FileViewerProps) {
  const [force, setForce] = useState(false)
  const listRef = useRef<FlashListRef<string>>(null)
  const { saveToPhone } = useFileDownload()
  const { data, isLoading, error } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileRead(agentId, path, force),
    queryFn: () => api.agents.readFile(agentId, path, force),
    staleTime: 5_000,
    retry: false,
  })
  const lines = data?.content != null ? data.content.split("\n") : []

  useEffect(() => {
    if (!line || lines.length === 0) return
    const index = Math.max(0, Math.min(line - 1, lines.length - 1))
    setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.3 }), 80)
  }, [line, lines.length])

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={onBack} hitSlop={10}><Text style={{ color: c.link, fontSize: 14 }}>‹ Files</Text></TouchableOpacity>
        <Text style={{ color: c.fg, fontSize: 12, fontFamily: "monospace", flex: 1 }} numberOfLines={1}>{path}</Text>
        {canSaveToPhone && (
          <TouchableOpacity onPress={() => saveToPhone({ agentId, path, kind: "file" })} hitSlop={10}>
            <Ionicons name="download-outline" size={17} color={c.fgSub} />
          </TouchableOpacity>
        )}
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={c.link} /></View>
      ) : error || !data ? (
        <Text style={{ color: c.fgSub, fontSize: 13, padding: 16 }}>Could not open this file.</Text>
      ) : data.content === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
          <Text style={{ color: c.fg, fontSize: 13, textAlign: "center" }}>
            {data.binary ? "This file looks like binary data and can't be previewed as text" : "This file is too large to preview"}
          </Text>
          <TouchableOpacity onPress={() => setForce(true)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: c.secondary }}>
            <Text style={{ color: c.fg, fontSize: 13 }}>View as text anyway</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={lines}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <TouchableOpacity activeOpacity={0.7} delayLongPress={350} onLongPress={() => onComment(path, index + 1)}>
              <CodeLine lineNo={index + 1} text={item} highlighted={index + 1 === line} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

function CodeLine({ lineNo, text, highlighted }: { lineNo: number; text: string; highlighted: boolean }) {
  const tokens = tokenize(text)
  return (
    <View style={{ flexDirection: "row", minHeight: 22, backgroundColor: highlighted ? c.secondary : "transparent" }}>
      <Text style={{ color: c.placeholder, fontSize: 10, fontFamily: "monospace", width: 40, textAlign: "right", paddingRight: 8, paddingTop: 3 }}>{lineNo}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 20, paddingTop: 2, paddingRight: 16 }}>
          {tokens.map((tok, i) => <Text key={i} style={{ color: TOKEN_COLOR[tok.cls] ?? c.fgBright }}>{tok.text}</Text>)}
        </Text>
      </ScrollView>
    </View>
  )
}
