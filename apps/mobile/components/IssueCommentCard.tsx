import { View, Text } from "react-native"
import type { PRIssueComment } from "@huxflux/shared"
import { c } from "../theme"
import { timeAgo } from "./ThreadCard"
import { Markdown } from "./Markdown"

export function IssueCommentCard({ comment }: { comment: PRIssueComment }) {
  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: c.fgSub, fontSize: 9, fontWeight: "700" }}>{comment.author[0]?.toUpperCase()}</Text>
        </View>
        <Text style={{ color: c.fgBright, fontSize: 12, fontWeight: "600" }}>{comment.author}</Text>
        <Text style={{ color: c.fgSub, fontSize: 10 }}>{timeAgo(comment.createdAt)}</Text>
      </View>
      <View style={{ paddingLeft: 26 }}>
        <Markdown content={comment.body} />
      </View>
    </View>
  )
}
