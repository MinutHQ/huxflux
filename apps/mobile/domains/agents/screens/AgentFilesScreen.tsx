import { useState } from "react"
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native"
import { useAgent, type PRComment } from "@huxflux/shared"
import { c } from "@/theme"
import { BrowseTab } from "../components/files/BrowseTab"
import { DiffTab } from "../components/files/DiffTab"
import { FileViewer } from "../components/files/FileViewer"
import { useLineComment } from "../hooks/useLineComment"

interface AgentFilesScreenProps {
  agentId: string
  comments: PRComment[]
  onAddComment: (c: PRComment) => void
}

/**
 * The agent's Files tab: Diff (all changes stacked, like the web Diff pane)
 * and Files (worktree browser with name filter and `?` content search). Files
 * open in an in-tab viewer so line comments stay with this agent's chat.
 */
export function AgentFilesScreen({ agentId, comments, onAddComment }: AgentFilesScreenProps) {
  const { data: agent, isLoading } = useAgent(agentId)
  const [segment, setSegment] = useState<"diff" | "files">("diff")
  const [open, setOpen] = useState<{ path: string; line?: number } | null>(null)
  const comment = useLineComment(onAddComment)

  if (isLoading || !agent) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={c.link} /></View>
  }

  const openFile = (path: string, line?: number) => { setSegment("files"); setOpen({ path, line }) }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>
        {(["diff", "files"] as const).map((s) => (
          <TouchableOpacity key={s} onPress={() => setSegment(s)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: segment === s ? c.secondary : "transparent" }}>
            <Text style={{ color: segment === s ? c.fg : c.fgSub, fontSize: 12, fontWeight: segment === s ? "600" : "400" }}>
              {s === "diff" ? `Diff${agent.fileChanges.length ? ` (${agent.fileChanges.length})` : ""}` : "Files"}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        {comments.length > 0 && (
          <Text style={{ color: c.link, fontSize: 11, alignSelf: "center" }}>
            {comments.length} comment{comments.length === 1 ? "" : "s"} waiting in chat
          </Text>
        )}
      </View>
      {segment === "diff" && <DiffTab agent={agent} onComment={comment} onOpenFile={(path) => openFile(path)} />}
      {/* The browser stays mounted under the viewer so its filter and open folders survive "‹ Files". */}
      <View style={{ flex: 1, display: segment === "files" && !open ? "flex" : "none" }}>
        <BrowseTab agent={agent} onOpen={openFile} />
      </View>
      {segment === "files" && open && (
        <FileViewer agentId={agent.id} path={open.path} line={open.line} onBack={() => setOpen(null)} onComment={comment} />
      )}
    </View>
  )
}
