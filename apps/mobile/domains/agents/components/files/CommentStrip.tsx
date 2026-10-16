import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { PRComment } from "@huxflux/shared"
import { c } from "@/theme"

/** Pending line comments above the composer; they go out with the next message. */
export function CommentStrip({ comments, onRemove }: { comments: PRComment[]; onRemove: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
      {comments.map((cm) => (
        <View
          key={cm.id}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 240, paddingLeft: 10, paddingRight: 6, paddingVertical: 5, borderRadius: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}
        >
          <Ionicons name="chatbox-ellipses-outline" size={12} color={c.link} />
          <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace" }} numberOfLines={1}>
            {cm.path?.split("/").pop()}{cm.line ? `:${cm.line}` : ""}
          </Text>
          <Text style={{ color: c.fg, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>{cm.body}</Text>
          <TouchableOpacity onPress={() => onRemove(cm.id)} hitSlop={8}>
            <Ionicons name="close" size={13} color={c.fgSub} />
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  )
}
