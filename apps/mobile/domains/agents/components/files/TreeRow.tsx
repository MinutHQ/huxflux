import { View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { useState } from "react"
import { c } from "@/theme"

export type TreeNode = { name: string; path: string; type: "file" | "directory"; children?: TreeNode[] }

export function TreeRow({ node, depth, agentId }: { node: TreeNode; depth: number; agentId: string }) {
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
